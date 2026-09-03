import { getAdapter } from "./adapters"
import { companyKey, dedupKey, jobHash } from "./company-key"
import { chunk, placeholders, runBatch, selectIn } from "./db"
import { message } from "./errors"
import { renderDigest, sendTelegram } from "./notify"
import { clipDescription, passesPrefilter } from "./prefilter"
import { toSalary } from "./salary"
import { scoreInBatches, scoreJobs, type ScoreInput } from "./scoring"
import { blockedCompanyKeys, excludeBlockedCompanies, resolvePrefilter, resolveScoringConfig } from "./settings"
import { trackCompany, type TrackResult } from "./sources"
import type { Bindings, RawJob, SourceRow } from "./types"

type RunResult = {
  source_id: number
  ok: boolean
  jobs_found: number
  jobs_new: number
  error: string | null
  duration_ms: number
  suspicious: number
}

/** Never-run, failed, or last success older than 3 hours. Fresh successes are skipped. */
async function loadDueSources(db: D1Database): Promise<SourceRow[]> {
  const res = await db
    .prepare(
      `SELECT s.* FROM sources s
       WHERE s.enabled = 1 AND s.deleted_at IS NULL
         AND (
           s.last_run_at IS NULL
           OR s.last_run_at < datetime('now', '-3 hours')
           OR COALESCE(
             (SELECT ok FROM source_runs r WHERE r.source_id = s.id ORDER BY r.id DESC LIMIT 1),
             0
           ) = 0
         )
       ORDER BY s.last_run_at ASC NULLS FIRST`,
    )
    .all<SourceRow>()
  return res.results
}

export function isSuspicious(lastCount: number | null, found: number): boolean {
  return lastCount != null && lastCount > 0 && found < lastCount * 0.5
}

type TwinRow = {
  id: string
  kind: string
  first_seen_at: string
  applied_at: string | null
  viewed_at: string | null
  notes: string | null
  status: string
  score: number | null
  score_reason: string | null
  flags: string | null
}

export type SourceStep = RunResult & {
  more: boolean
  nextOffset: number
  runStart: string
}

/**
 * Rows written per hop. The slice exists so a hop finishes inside the Worker's
 * budget; since the writes go out in batches rather than one statement at a time,
 * it can be far wider than the round-trip-per-row version could afford.
 */
const SOURCE_CHUNK = 200
const FETCH_CACHE_MS = 10 * 60_000

type FetchCache = { key: string; jobs: RawJob[]; at: number }
let fetchCache: FetchCache | null = null

function timed<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(label)), ms)
    promise.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (error) => {
        clearTimeout(timer)
        reject(error)
      },
    )
  })
}

async function loadBoard(
  env: Bindings,
  source: SourceRow,
  runStart: string,
): Promise<RawJob[]> {
  const key = `${source.id}:${runStart}`
  if (fetchCache && fetchCache.key === key && Date.now() - fetchCache.at < FETCH_CACHE_MS) {
    return fetchCache.jobs
  }
  const adapter = getAdapter(source.provider)
  const jobs = await timed(
    adapter.fetchJobs(source.token, env),
    20_000,
    `${source.label}: fetch timed out`,
  )
  fetchCache = { key, jobs, at: Date.now() }
  return jobs
}

function clearBoardCache(): void {
  fetchCache = null
}

/**
 * Writes one slice of a board. Every read is done once for the whole slice and
 * every write goes out in batches: a statement per row used to cost a round trip,
 * and sixty rows of those is what pushed a cycle hop past the Worker's budget.
 */
export async function upsertJobs(
  env: Bindings,
  source: SourceRow,
  jobs: RawJob[],
  watched: Set<string>,
): Promise<number> {
  if (jobs.length === 0) return 0
  const blocked = await blockedCompanyKeys(env)

  const rows = await Promise.all(
    jobs.map(async (job) => {
      const company = job.company ?? source.label
      return {
        job,
        company,
        key: companyKey(company),
        opening: dedupKey(company, job.title) || null,
        id: await jobHash(source.provider, source.token, job.externalId),
      }
    }),
  )
  const wanted = rows.filter((row) => !(row.key && blocked.has(row.key)))
  if (wanted.length === 0) return 0

  const present = new Set(
    (
      await selectIn<{ id: string }>(
        env,
        (list) => `SELECT id FROM jobs WHERE id IN (${list})`,
        wanted.map((row) => row.id),
      )
    ).map((row) => row.id),
  )
  const twins = new Map<string, TwinRow>()
  const openings = [...new Set(wanted.filter((row) => !present.has(row.id) && row.opening).map((row) => row.opening!))]
  for (const twin of await selectIn<TwinRow & { dedup_key: string }>(
    env,
    (list) => `SELECT j.id, j.dedup_key, s.kind, j.first_seen_at, j.applied_at, j.viewed_at, j.notes, j.status,
                 j.score, j.score_reason, j.flags
       FROM jobs j JOIN sources s ON s.id = j.source_id
       WHERE j.closed_at IS NULL AND j.dedup_key IN (${list})`,
    openings,
  )) {
    if (!twins.has(twin.dedup_key)) twins.set(twin.dedup_key, twin)
  }

  const writes: D1PreparedStatement[] = []
  /** Openings already claimed by an earlier row of this same slice. */
  const claimed = new Set<string>()
  let jobsNew = 0

  for (const { job, company, key, opening, id } of wanted) {
    const existing = present.has(id)
    // Two copies of one opening on the same board: the first one wins, exactly
    // as it did when each row looked itself up against the rows written before it.
    if (opening && !existing && claimed.has(opening)) continue

    let inherit: TwinRow | null = null
    if (opening && !existing) {
      const twin = twins.get(opening)
      if (twin) {
        if (source.kind !== "company" || twin.kind !== "query") continue
        inherit = twin
        twins.delete(opening)
        writes.push(env.DB.prepare(`DELETE FROM jobs WHERE id = ?`).bind(twin.id))
      }
      claimed.add(opening)
    }

    if (!existing) {
      jobsNew += 1
      present.add(id)
    }
    const description = clipDescription(job.description) ?? null
    writes.push(
      env.DB.prepare(
        `INSERT INTO jobs (id, source_id, external_id, company, company_key, title, location, url, description, posted_at, salary_min, salary_max, salary_currency, dedup_key, first_seen_at, last_seen_at, changed_at, closed_at, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'), datetime('now'), NULL, 'new')
         ON CONFLICT(id) DO UPDATE SET
           last_seen_at = datetime('now'),
           title = excluded.title,
           location = excluded.location,
           dedup_key = excluded.dedup_key,
           closed_at = NULL,
           posted_at = COALESCE(excluded.posted_at, jobs.posted_at),
           description = COALESCE(excluded.description, jobs.description),
           salary_min = COALESCE(excluded.salary_min, jobs.salary_min),
           salary_max = COALESCE(excluded.salary_max, jobs.salary_max),
           salary_currency = COALESCE(excluded.salary_currency, jobs.salary_currency),
           changed_at = CASE
             WHEN excluded.title IS NOT jobs.title
               OR IFNULL(excluded.location, '') IS NOT IFNULL(jobs.location, '')
               OR (excluded.description IS NOT NULL AND excluded.description IS NOT IFNULL(jobs.description, ''))
               OR (excluded.posted_at IS NOT NULL AND excluded.posted_at IS NOT IFNULL(jobs.posted_at, ''))
               OR IFNULL(excluded.salary_min, -1) IS NOT IFNULL(jobs.salary_min, -1)
               OR IFNULL(excluded.salary_max, -1) IS NOT IFNULL(jobs.salary_max, -1)
             THEN datetime('now')
             ELSE IFNULL(jobs.changed_at, jobs.first_seen_at)
           END`,
      ).bind(
        id,
        source.id,
        job.externalId,
        company,
        key,
        job.title,
        job.location ?? null,
        job.url,
        description,
        job.postedAt ?? null,
        job.salary?.min ?? null,
        job.salary?.max ?? null,
        job.salary?.currency || null,
        opening,
      ),
    )

    if (inherit) writes.push(inheritUpdate(env, inherit, id))

    if (source.kind === "query" && key && !watched.has(key)) {
      writes.push(
        env.DB.prepare(
          `INSERT INTO discovered_companies (company_key, company, first_seen_at, hits, sample_url, state)
           VALUES (?, ?, datetime('now'), 1, ?, 'new')
           ON CONFLICT(company_key) DO UPDATE SET
             hits = hits + 1,
             sample_url = COALESCE(discovered_companies.sample_url, excluded.sample_url)`,
        ).bind(key, company, job.url),
      )
    }
  }

  await runBatch(env, writes)
  return jobsNew
}

/** Statuses that came from the user, not from a board, and so outlive the copy that carried them. */
const USER_STATUS = new Set(["applied", "interview", "rejected", "saved", "ignored"])

/** Moves what the user did to the aggregator's copy onto the employer's own row. */
function inheritUpdate(env: Bindings, inherit: TwinRow, id: string): D1PreparedStatement {
  return env.DB.prepare(
    `UPDATE jobs SET
       first_seen_at = CASE WHEN ? < first_seen_at THEN ? ELSE first_seen_at END,
       applied_at = COALESCE(?, applied_at),
       viewed_at = COALESCE(?, viewed_at),
       notes = COALESCE(notes, ?),
       status = CASE WHEN ? = 1 THEN ? ELSE status END,
       score = COALESCE(score, ?),
       score_reason = COALESCE(score_reason, ?),
       flags = COALESCE(flags, ?)
     WHERE id = ?`,
  ).bind(
    inherit.first_seen_at,
    inherit.first_seen_at,
    inherit.applied_at,
    inherit.viewed_at,
    inherit.notes,
    USER_STATUS.has(inherit.status) ? 1 : 0,
    inherit.status,
    inherit.score,
    inherit.score_reason,
    inherit.flags,
    id,
  )
}

/** One slice of a board so waitUntil can finish. Same source continues on the next hop. */
export async function runSourceStep(
  env: Bindings,
  source: SourceRow,
  offset: number,
  priorStart: string | null,
): Promise<SourceStep> {
  const started = Date.now()
  const nowRow = await env.DB.prepare(`SELECT datetime('now') AS now`).first<{ now: string }>()
  const runStart = priorStart ?? nowRow?.now ?? new Date().toISOString().replace("T", " ").slice(0, 19)
  try {
    const raw = await loadBoard(env, source, runStart)
    const slice = raw.slice(offset, offset + SOURCE_CHUNK)
    const watched = await trackedCompanyKeys(env.DB)
    const jobsNew = await upsertJobs(env, source, slice, watched)
    const nextOffset = offset + slice.length
    const more = nextOffset < raw.length
    const suspicious = isSuspicious(source.last_count, raw.length)

    if (!more) {
      if (!suspicious) {
        await env.DB.prepare(
          `UPDATE jobs SET closed_at = datetime('now')
           WHERE source_id = ? AND closed_at IS NULL AND last_seen_at < ?`,
        )
          .bind(source.id, runStart)
          .run()
      }
      await env.DB.prepare(
        `UPDATE sources SET last_count = ?, last_run_at = datetime('now') WHERE id = ?`,
      )
        .bind(raw.length, source.id)
        .run()
      await env.DB.prepare(
        `INSERT INTO source_runs (source_id, ok, jobs_found, jobs_new, error, duration_ms, suspicious)
         VALUES (?, 1, ?, ?, NULL, ?, ?)`,
      )
        .bind(source.id, raw.length, jobsNew, Date.now() - started, suspicious ? 1 : 0)
        .run()
      clearBoardCache()
    }

    return {
      source_id: source.id,
      ok: true,
      jobs_found: slice.length,
      jobs_new: jobsNew,
      error: null,
      duration_ms: Date.now() - started,
      suspicious: suspicious ? 1 : 0,
      more,
      nextOffset,
      runStart,
    }
  } catch (error) {
    clearBoardCache()
    const failure = message(error)
    await env.DB.prepare(`UPDATE sources SET last_run_at = datetime('now') WHERE id = ?`).bind(source.id).run()
    await env.DB.prepare(
      `INSERT INTO source_runs (source_id, ok, jobs_found, jobs_new, error, duration_ms, suspicious)
       VALUES (?, 0, NULL, NULL, ?, ?, 0)`,
    )
      .bind(source.id, failure, Date.now() - started)
      .run()
    return {
      source_id: source.id,
      ok: false,
      jobs_found: 0,
      jobs_new: 0,
      error: failure,
      duration_ms: Date.now() - started,
      suspicious: 0,
      more: false,
      nextOffset: 0,
      runStart,
    }
  }
}

export async function runSource(env: Bindings, source: SourceRow): Promise<RunResult> {
  let offset = 0
  let runStart: string | null = null
  let last: SourceStep | null = null
  let jobsNew = 0
  let found = 0
  do {
    last = await runSourceStep(env, source, offset, runStart)
    offset = last.nextOffset
    runStart = last.runStart
    jobsNew += last.jobs_new
    found += last.jobs_found
    if (!last.ok) return last
  } while (last.more)
  return {
    ...last,
    jobs_found: found,
    jobs_new: jobsNew,
  }
}

/** Employers we already follow on their own board, by label or ATS slug. */
export async function trackedCompanyKeys(db: D1Database): Promise<Set<string>> {
  const rows = await db
    .prepare(`SELECT label, token FROM sources WHERE deleted_at IS NULL AND kind = 'company'`)
    .all<{ label: string; token: string }>()
  const keys = new Set<string>()
  for (const row of rows.results) {
    for (const raw of [row.label, row.token]) {
      const key = companyKey(raw)
      if (key) keys.add(key)
    }
  }
  return keys
}

type Verdict = { score: number; score_reason: string | null; flags: string | null }

export type ScorePass = {
  scored: number
  remaining: number
  /** Whether another pass would still find work. Drives the cycle's scoring phase. */
  more: boolean
}

/**
 * How many unscored rows one pass pulls in. Without a cap a large backlog made
 * every hop read the whole table, which is what used to burn D1's daily quota.
 */
const CANDIDATE_WINDOW = 500

type Candidate = {
  id: string
  company: string
  company_key: string
  title: string
  location: string | null
  dedup_key: string | null
}

const PARK_OFF_PROFILE = `UPDATE jobs
  SET score = 0, score_reason = 'prefilter', flags = '[]', status = 'off_profile', description = NULL
  WHERE id IN`

function verdictUpdate(env: Bindings, id: string, verdict: Verdict): D1PreparedStatement {
  return env.DB.prepare(`UPDATE jobs SET score = ?, score_reason = ?, flags = ? WHERE id = ?`).bind(
    verdict.score,
    verdict.score_reason,
    verdict.flags,
    id,
  )
}

/**
 * Scores what the prefilter lets through. `limit` caps how many jobs reach the
 * model in one pass, so a caller that wants to report progress can walk the
 * queue in steps instead of waiting out one opaque request.
 */
export async function prefilterAndScore(env: Bindings, limit?: number): Promise<ScorePass> {
  const blocked = await excludeBlockedCompanies(env, "company_key")

  // Only unscored rows can change here, which is the shape `idx_jobs_unscored` covers.
  // Re-parking jobs that already carry a score is `reapplyPrefilter`'s job.
  const open = await env.DB.prepare(
    `SELECT id, company, company_key, title, location, dedup_key
     FROM jobs
     WHERE closed_at IS NULL AND score IS NULL
       AND status NOT IN ('ignored', 'rejected', 'off_profile')
       AND ${blocked.sql}
     ORDER BY first_seen_at
     LIMIT ?`,
  )
    .bind(...blocked.binds, CANDIDATE_WINDOW)
    .all<Candidate>()

  const rules = await resolvePrefilter(env)
  const candidates: Candidate[] = []
  const dropIds: string[] = []
  for (const job of open.results) {
    // Kept out of the scoring queue but not out of sight: the title says the
    // role is not ours, and the description is dropped because nothing reads it.
    if (passesPrefilter(job.title, rules)) candidates.push(job)
    else dropIds.push(job.id)
  }

  await runBatch(
    env,
    chunk(dropIds, 40).map((part) =>
      env.DB.prepare(`${PARK_OFF_PROFILE} (${placeholders(part.length)})`).bind(...part),
    ),
  )

  // A role we already judged on one board is the same role on the next one, so
  // its verdict carries over instead of being bought again. Only the openings in
  // this window are looked up, rather than every scored row in the table.
  const keys = [...new Set(candidates.map((job) => job.dedup_key).filter((key): key is string => Boolean(key)))]
  const judged = await selectIn<Verdict & { dedup_key: string }>(
    env,
    (list) => `SELECT dedup_key, MAX(score) AS score, score_reason, flags FROM jobs
       WHERE score IS NOT NULL AND dedup_key IN (${list})
       GROUP BY dedup_key`,
    keys,
  )
  const verdicts = new Map(judged.map((row) => [row.dedup_key, row]))

  const toScore: Array<{ id: string; company_key: string; dedup_key: string | null; input: ScoreInput }> = []
  /** Twins of a job that is being scored right now, waiting for its verdict. */
  const awaiting = new Map<string, string[]>()
  const inherited: D1PreparedStatement[] = []

  for (const job of candidates) {
    const key = job.dedup_key
    if (key) {
      const known = verdicts.get(key)
      if (known) {
        inherited.push(verdictUpdate(env, job.id, known))
        continue
      }
      const queued = awaiting.get(key)
      if (queued) {
        queued.push(job.id)
        continue
      }
      awaiting.set(key, [])
    }

    toScore.push({
      id: job.id,
      company_key: job.company_key,
      dedup_key: job.dedup_key,
      input: {
        external_id: job.id,
        title: job.title,
        company: job.company,
        location: job.location ?? "",
        description: "",
      },
    })
  }
  await runBatch(env, inherited)

  const batch = limit ? toScore.slice(0, limit) : toScore
  const remaining = toScore.length - batch.length

  if (batch.length > 0) {
    const bodies = await selectIn<{ id: string; description: string | null }>(
      env,
      (list) => `SELECT id, description FROM jobs WHERE id IN (${list})`,
      batch.map((item) => item.id),
    )
    const byId = new Map(bodies.map((row) => [row.id, row.description ?? ""]))
    for (const item of batch) {
      item.input.description = byId.get(item.id) ?? ""
    }
  }

  const profileRow = await env.DB.prepare(`SELECT content FROM profile WHERE id = 1`).first<{ content: string }>()
  const scores = await scoreInBatches(
    batch.map((item) => item.input),
    profileRow?.content ?? "",
    await resolveScoringConfig(env),
  )

  const byId = new Map(batch.map((item) => [item.id, item]))
  const writes: D1PreparedStatement[] = []
  for (const item of scores) {
    const verdict = { score: item.score, score_reason: item.reason, flags: JSON.stringify(item.flags) }
    writes.push(verdictUpdate(env, item.external_id, verdict))

    const scored = byId.get(item.external_id)
    if (!scored) continue
    for (const twin of (scored.dedup_key && awaiting.get(scored.dedup_key)) || []) {
      writes.push(verdictUpdate(env, twin, verdict))
    }
    if (scored.company_key) {
      writes.push(
        env.DB.prepare(
          `UPDATE discovered_companies
           SET best_score = CASE WHEN best_score IS NULL OR best_score < ? THEN ? ELSE best_score END
           WHERE company_key = ?`,
        ).bind(item.score, item.score, scored.company_key),
      )
    }
  }
  await runBatch(env, writes)
  await bootstrapColdSources(env)

  const resolved = dropIds.length + inherited.length + scores.length
  return {
    scored: scores.length,
    remaining,
    // A batch that scored nothing cannot make progress by trying again, and a
    // full window only hides more work once this pass has cleared room for it.
    more: (remaining > 0 && scores.length > 0) || (open.results.length === CANDIDATE_WINDOW && resolved > 0),
  }
}

/**
 * A brand-new source arrives with its whole backlog, which would make one huge
 * digest. Mark it as already delivered rather than ignored, so it still shows up
 * in the admin.
 */
async function bootstrapColdSources(env: Bindings): Promise<void> {
  const cold = await env.DB.prepare(
    `SELECT id FROM sources WHERE bootstrapped = 0 AND deleted_at IS NULL`,
  ).all<{ id: number }>()
  await runBatch(
    env,
    cold.results.flatMap((source) => [
      env.DB.prepare(
        `UPDATE jobs SET notified_at = datetime('now')
         WHERE source_id = ? AND status = 'new' AND notified_at IS NULL`,
      ).bind(source.id),
      env.DB.prepare(`UPDATE sources SET bootstrapped = 1 WHERE id = ?`).bind(source.id),
    ]),
  )
}

/**
 * Re-runs the title tags against open jobs after the user edits keep/drop.
 * Leaves saved / applied / ignored rows alone — those are a human decision.
 */
export async function reapplyPrefilter(
  env: Bindings,
): Promise<{ dropped: number; restored: number }> {
  const rules = await resolvePrefilter(env)
  const rows = await env.DB.prepare(
    `SELECT id, title, status FROM jobs
     WHERE closed_at IS NULL AND status IN ('new', 'notified', 'off_profile')`,
  ).all<{ id: string; title: string; status: string }>()

  const drop: string[] = []
  const restore: string[] = []
  for (const row of rows.results) {
    const pass = passesPrefilter(row.title, rules)
    if (!pass && row.status !== "off_profile") drop.push(row.id)
    else if (pass && row.status === "off_profile") restore.push(row.id)
  }

  await runBatch(env, [
    ...chunk(drop, 40).map((part) =>
      env.DB.prepare(`${PARK_OFF_PROFILE} (${placeholders(part.length)})`).bind(...part),
    ),
    ...chunk(restore, 40).map((part) =>
      env.DB.prepare(
        `UPDATE jobs SET score = NULL, score_reason = NULL, flags = NULL, status = 'new'
         WHERE status = 'off_profile' AND id IN (${placeholders(part.length)})`,
      ).bind(...part),
    ),
  ])
  return { dropped: drop.length, restored: restore.length }
}

export type ScoredJob = {
  id: string
  score: number
  score_reason: string | null
  flags: string | null
  status: string
}

/**
 * Scores postings regardless of prefilter or an existing verdict.
 * A manual click means "judge these rows", not "queue whatever is still new".
 */
export async function scoreJobsByIds(env: Bindings, ids: string[]): Promise<ScoredJob[]> {
  const unique = [...new Set(ids.map((id) => id.trim()).filter(Boolean))].slice(0, 10)
  if (unique.length === 0) return []

  const rows = await env.DB.prepare(
    `SELECT id, company, company_key, title, location, description, status, closed_at
     FROM jobs WHERE id IN (${unique.map(() => "?").join(", ")}) AND closed_at IS NULL`,
  )
    .bind(...unique)
    .all<{
      id: string
      company: string
      company_key: string
      title: string
      location: string | null
      description: string | null
      status: string
      closed_at: string | null
    }>()
  if (rows.results.length === 0) throw new Error("not found")

  const profileRow = await env.DB.prepare(`SELECT content FROM profile WHERE id = 1`).first<{ content: string }>()
  const scores = await scoreJobs(
    rows.results.map((job) => ({
      external_id: job.id,
      title: job.title,
      company: job.company,
      location: job.location ?? "",
      description: job.description ?? "",
    })),
    profileRow?.content ?? "",
    await resolveScoringConfig(env),
  )
  const byId = new Map(scores.map((row) => [row.external_id, row]))

  const out: ScoredJob[] = []
  for (const job of rows.results) {
    const item = byId.get(job.id)
    if (!item) continue
    const flags = JSON.stringify(item.flags)
    const status = job.status === "off_profile" ? "new" : job.status
    await env.DB.prepare(`UPDATE jobs SET score = ?, score_reason = ?, flags = ?, status = ? WHERE id = ?`)
      .bind(item.score, item.reason || null, flags, status, job.id)
      .run()

    if (job.company_key) {
      await env.DB.prepare(
        `UPDATE discovered_companies
         SET best_score = CASE WHEN best_score IS NULL OR best_score < ? THEN ? ELSE best_score END
         WHERE company_key = ?`,
      )
        .bind(item.score, item.score, job.company_key)
        .run()
    }

    out.push({ id: job.id, score: item.score, score_reason: item.reason || null, flags, status })
  }
  if (out.length === 0) throw new Error("Модель не вернула оценку")
  return out
}

export async function scoreOneJob(env: Bindings, id: string): Promise<ScoredJob> {
  const [job] = await scoreJobsByIds(env, [id])
  if (!job) throw new Error("not found")
  return job
}

export async function notifyNew(env: Bindings): Promise<number> {
  // One line per opening, not per board that carries it. Grouping on the
  // dedup key keeps the copy from the employer's own board, whose link goes
  // straight to the posting rather than through an aggregator.
  const blocked = await excludeBlockedCompanies(env, "j.company_key")
  const rows = await env.DB.prepare(
    `SELECT j.company, j.title, j.url, MAX(j.score) AS score, j.score_reason as reason, j.flags, j.id,
            s.tier, j.dedup_key, MAX(j.salary_min) AS salary_min, MAX(j.salary_max) AS salary_max,
            MIN(j.salary_currency) AS salary_currency
     FROM jobs j JOIN sources s ON s.id = j.source_id
     WHERE j.notified_at IS NULL AND j.closed_at IS NULL AND j.status = 'new' AND j.score IS NOT NULL
       AND ${blocked.sql}
       AND (
         (s.tier = 'watchlist' AND j.score >= 55) OR
         (s.tier = 'discovery' AND j.score >= 70)
       )
     GROUP BY COALESCE(j.dedup_key, j.id)
     ORDER BY score DESC
     LIMIT 25`,
  )
    .bind(...blocked.binds)
    .all<{
      company: string
      title: string
      url: string
      score: number
      reason: string | null
      flags: string | null
      id: string
      dedup_key: string | null
      salary_min: number | null
      salary_max: number | null
      salary_currency: string | null
    }>()

  const discovered = await env.DB.prepare(
    `SELECT COUNT(*) as n FROM discovered_companies WHERE state = 'new' AND first_seen_at >= datetime('now', '-1 day')`,
  ).first<{ n: number }>()

  if (rows.results.length === 0) return 0
  const text = renderDigest(rows.results, discovered?.n ?? 0)
  await sendTelegram(env, text)
  for (const job of rows.results) {
    // The twins left out of the digest have to be marked too, or each of them
    // becomes tomorrow's unsent notification for a job already delivered.
    await env.DB.prepare(
      `UPDATE jobs SET notified_at = datetime('now'), status = 'notified'
       WHERE id = ? OR (? IS NOT NULL AND dedup_key = ? AND notified_at IS NULL)`,
    )
      .bind(job.id, job.dedup_key, job.dedup_key)
      .run()
  }
  return rows.results.length
}

export async function pickSources(env: Bindings): Promise<SourceRow[]> {
  return loadDueSources(env.DB)
}

export async function addDiscovered(env: Bindings, key: string): Promise<TrackResult> {
  const row = await env.DB.prepare(
    `SELECT company, sample_url, careers_url FROM discovered_companies WHERE company_key = ?`,
  )
    .bind(key)
    .first<{ company: string; sample_url: string | null; careers_url: string | null }>()
  if (!row) throw new Error("not found")
  return trackCompany(env, key, row.company, row.careers_url ?? row.sample_url)
}

export type ManualJobInput = {
  title: string
  company: string
  url: string
  location?: string
  description?: string
  notes?: string
  salary_min?: unknown
  salary_max?: unknown
  salary_currency?: string
  status?: string
  applied_at?: string
}

function parseAppliedAt(raw: string | undefined): string | null {
  const value = raw?.trim() ?? ""
  if (!value) return null
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return `${value} 12:00:00`
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(:\d{2})?$/.test(value)) {
    return value.length === 16 ? `${value}:00` : value
  }
  return null
}

function parseJobUrl(raw: string): string | null {
  try {
    const url = new URL(raw.trim())
    if (url.protocol !== "http:" && url.protocol !== "https:") return null
    return url.href
  } catch {
    return null
  }
}

async function ensureManualSource(env: Bindings): Promise<number> {
  const existing = await env.DB.prepare(
    `SELECT id FROM sources WHERE provider = 'manual' AND token = 'manual'`,
  ).first<{ id: number }>()
  if (existing) return existing.id
  await env.DB.prepare(
    `INSERT INTO sources (kind, tier, label, provider, token, enabled)
     VALUES ('company', 'watchlist', 'Вручную', 'manual', 'manual', 0)`,
  ).run()
  const created = await env.DB.prepare(
    `SELECT id FROM sources WHERE provider = 'manual' AND token = 'manual'`,
  ).first<{ id: number }>()
  if (!created) throw new Error("could not create manual source")
  return created.id
}

export async function createManualJob(env: Bindings, input: ManualJobInput) {
  const title = input.title.trim()
  const company = input.company.trim()
  const url = parseJobUrl(input.url)
  if (!title || !company) throw new Error("Нужны должность и компания")
  if (!url) throw new Error("Нужна ссылка http(s) на позицию")

  const status = input.status === "interview" ? "interview" : "applied"
  const sourceId = await ensureManualSource(env)
  const id = await jobHash("manual", "manual", url)
  const key = companyKey(company)
  const opening = dedupKey(company, title) || null
  const description = clipDescription(input.description) ?? null
  const notes = input.notes?.trim() || null
  const salary = toSalary({
    min: input.salary_min,
    max: input.salary_max,
    currency: input.salary_currency,
  })
  const appliedAt = parseAppliedAt(input.applied_at)

  await env.DB.prepare(
    `INSERT INTO jobs (
       id, source_id, external_id, company, company_key, title, location, url, description,
       posted_at, salary_min, salary_max, salary_currency, dedup_key,
       first_seen_at, last_seen_at, changed_at, closed_at, status, notes, applied_at
     ) VALUES (
       ?, ?, ?, ?, ?, ?, ?, ?, ?,
       NULL, ?, ?, ?, ?,
       datetime('now'), datetime('now'), datetime('now'), NULL, ?, ?, COALESCE(?, datetime('now'))
     )
     ON CONFLICT(id) DO UPDATE SET
       title = excluded.title,
       company = excluded.company,
       company_key = excluded.company_key,
       location = excluded.location,
       description = COALESCE(excluded.description, jobs.description),
       salary_min = COALESCE(excluded.salary_min, jobs.salary_min),
       salary_max = COALESCE(excluded.salary_max, jobs.salary_max),
       salary_currency = COALESCE(excluded.salary_currency, jobs.salary_currency),
       dedup_key = excluded.dedup_key,
       notes = COALESCE(excluded.notes, jobs.notes),
       status = excluded.status,
       applied_at = COALESCE(jobs.applied_at, excluded.applied_at),
       closed_at = NULL,
       last_seen_at = datetime('now'),
       changed_at = datetime('now')`,
  )
    .bind(
      id,
      sourceId,
      url,
      company,
      key,
      title,
      input.location?.trim() || null,
      url,
      description,
      salary?.min ?? null,
      salary?.max ?? null,
      salary?.currency || null,
      opening,
      status,
      notes,
      appliedAt,
    )
    .run()

  const job = await env.DB.prepare(
    `SELECT j.id, j.source_id, j.company, j.company_key, j.title, j.location, j.url,
            j.posted_at, j.first_seen_at, j.last_seen_at, j.changed_at,
            j.salary_min, j.salary_max, j.salary_currency,
            j.score, j.score_reason, j.flags, j.status, j.applied_at, j.viewed_at, j.notes, j.description,
            s.tier, s.label as source_label
     FROM jobs j JOIN sources s ON s.id = j.source_id
     WHERE j.id = ?`,
  )
    .bind(id)
    .first()
  if (!job) throw new Error("not found")
  return job
}
