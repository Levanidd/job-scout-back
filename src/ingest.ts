import { getAdapter } from "./adapters"
import { companyKey, dedupKey, jobHash } from "./company-key"
import { detectUrl } from "./detect"
import { renderDigest, sendTelegram } from "./notify"
import { clipDescription, passesPrefilter } from "./prefilter"
import { scoreInBatches, scoreJobs, type ScoreInput } from "./scoring"
import { resolvePrefilter, resolveScoringConfig } from "./settings"
import type { Bindings, SourceRow } from "./types"

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

export async function runSource(env: Bindings, source: SourceRow): Promise<RunResult> {
  const started = Date.now()
  const nowRow = await env.DB.prepare(`SELECT datetime('now') AS now`).first<{ now: string }>()
  const runStart = nowRow?.now ?? new Date().toISOString().replace("T", " ").slice(0, 19)
  try {
    const adapter = getAdapter(source.provider)
    const raw = await adapter.fetchJobs(source.token, env)
    const suspicious = isSuspicious(source.last_count, raw.length)

    let jobsNew = 0
    const watched = await watchedKeys(env.DB)

    for (const job of raw) {
      const id = await jobHash(source.provider, source.token, job.externalId)
      const company = job.company ?? source.label
      const key = companyKey(company)
      const opening = dedupKey(company, job.title) || null
      const existing = await env.DB.prepare(`SELECT id FROM jobs WHERE id = ?`).bind(id).first<{ id: string }>()

      type TwinRow = {
        id: string
        kind: string
        first_seen_at: string
        applied_at: string | null
        notes: string | null
        status: string
        score: number | null
        score_reason: string | null
        flags: string | null
      }
      let inherit: TwinRow | null = null

      // Same role already stored from another board or another geo posting.
      if (opening && !existing) {
        const twin = await env.DB.prepare(
          `SELECT j.id, s.kind, j.first_seen_at, j.applied_at, j.notes, j.status,
                  j.score, j.score_reason, j.flags
           FROM jobs j JOIN sources s ON s.id = j.source_id
           WHERE j.dedup_key = ? AND j.closed_at IS NULL LIMIT 1`,
        )
          .bind(opening)
          .first<TwinRow>()
        if (twin) {
          if (source.kind === "company" && twin.kind === "query") {
            inherit = twin
            await env.DB.prepare(`DELETE FROM jobs WHERE id = ?`).bind(twin.id).run()
          } else {
            continue
          }
        }
      }

      if (!existing) jobsNew += 1
      const description = clipDescription(job.description) ?? null
      await env.DB.prepare(
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
      )
        .bind(
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
        )
        .run()

      if (inherit) {
        const keepUser =
          inherit.status === "applied" ||
          inherit.status === "interview" ||
          inherit.status === "rejected" ||
          inherit.status === "saved" ||
          inherit.status === "ignored"
        await env.DB.prepare(
          `UPDATE jobs SET
             first_seen_at = CASE WHEN ? < first_seen_at THEN ? ELSE first_seen_at END,
             applied_at = COALESCE(?, applied_at),
             notes = COALESCE(notes, ?),
             status = CASE WHEN ? = 1 THEN ? ELSE status END,
             score = COALESCE(score, ?),
             score_reason = COALESCE(score_reason, ?),
             flags = COALESCE(flags, ?)
           WHERE id = ?`,
        )
          .bind(
            inherit.first_seen_at,
            inherit.first_seen_at,
            inherit.applied_at,
            inherit.notes,
            keepUser ? 1 : 0,
            inherit.status,
            inherit.score,
            inherit.score_reason,
            inherit.flags,
            id,
          )
          .run()
      }

      if (source.kind === "query" && key && !watched.has(key)) {
        await env.DB.prepare(
          `INSERT INTO discovered_companies (company_key, company, first_seen_at, hits, sample_url, state)
           VALUES (?, ?, datetime('now'), 1, ?, 'new')
           ON CONFLICT(company_key) DO UPDATE SET
             hits = hits + 1,
             sample_url = COALESCE(discovered_companies.sample_url, excluded.sample_url)`,
        )
          .bind(key, company, job.url)
          .run()
      }
    }

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

    return {
      source_id: source.id,
      ok: true,
      jobs_found: raw.length,
      jobs_new: jobsNew,
      error: null,
      duration_ms: Date.now() - started,
      suspicious: suspicious ? 1 : 0,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    await env.DB.prepare(`UPDATE sources SET last_run_at = datetime('now') WHERE id = ?`).bind(source.id).run()
    await env.DB.prepare(
      `INSERT INTO source_runs (source_id, ok, jobs_found, jobs_new, error, duration_ms, suspicious)
       VALUES (?, 0, NULL, NULL, ?, ?, 0)`,
    )
      .bind(source.id, message, Date.now() - started)
      .run()
    return {
      source_id: source.id,
      ok: false,
      jobs_found: 0,
      jobs_new: 0,
      error: message,
      duration_ms: Date.now() - started,
      suspicious: 0,
    }
  }
}

async function watchedKeys(db: D1Database): Promise<Set<string>> {
  return trackedCompanyKeys(db)
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

/**
 * Scores what the prefilter lets through. `limit` caps how many jobs reach the
 * model in one pass, so a caller that wants to report progress can walk the
 * queue in steps instead of waiting out one opaque request.
 */
export async function prefilterAndScore(
  env: Bindings,
  limit?: number,
): Promise<{ scored: number; remaining: number }> {
  const open = await env.DB.prepare(
    `SELECT id, company, company_key, title, location, score, status, dedup_key
     FROM jobs WHERE closed_at IS NULL AND (score IS NULL OR status = 'new')`,
  ).all<{
    id: string
    company: string
    company_key: string
    title: string
    location: string | null
    score: number | null
    status: string
    dedup_key: string | null
  }>()

  const profileRow = await env.DB.prepare(`SELECT content FROM profile WHERE id = 1`).first<{ content: string }>()
  const profile = profileRow?.content ?? ""
  const rules = await resolvePrefilter(env)

  // A role we already judged on one board is the same role on the next one, so
  // its verdict carries over instead of being bought again.
  const judged = await env.DB.prepare(
    `SELECT dedup_key, MAX(score) AS score, score_reason, flags FROM jobs
     WHERE dedup_key IS NOT NULL AND score IS NOT NULL
     GROUP BY dedup_key`,
  ).all<{ dedup_key: string; score: number; score_reason: string | null; flags: string | null }>()
  const verdicts = new Map(judged.results.map((row) => [row.dedup_key, row]))

  const toScore: Array<{ id: string; company_key: string; dedup_key: string | null; input: ScoreInput }> = []
  /** Twins of a job that is being scored right now, waiting for its verdict. */
  const awaiting = new Map<string, string[]>()
  const dropIds: string[] = []

  const applyVerdict = async (
    id: string,
    verdict: { score: number; score_reason: string | null; flags: string | null },
  ) => {
    await env.DB.prepare(`UPDATE jobs SET score = ?, score_reason = ?, flags = ? WHERE id = ?`)
      .bind(verdict.score, verdict.score_reason, verdict.flags, id)
      .run()
  }

  for (const job of open.results) {
    if (job.status === "ignored" || job.status === "rejected" || job.status === "off_profile") continue
    if (!passesPrefilter(job.title, rules)) {
      // Kept out of the scoring queue but not out of sight: the title says the
      // role is not ours, and the description is dropped because nothing reads it.
      dropIds.push(job.id)
      continue
    }
    if (job.score != null) continue

    const key = job.dedup_key
    if (key) {
      const known = verdicts.get(key)
      if (known) {
        await applyVerdict(job.id, known)
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

  if (dropIds.length > 0) {
    await updateIds(
      env,
      dropIds,
      `UPDATE jobs SET score = 0, score_reason = 'prefilter', flags = '[]', status = 'off_profile', description = NULL WHERE id IN`,
    )
  }

  const batch = limit ? toScore.slice(0, limit) : toScore
  const remaining = toScore.length - batch.length

  if (batch.length > 0) {
    const bodies = await env.DB.prepare(
      `SELECT id, description FROM jobs WHERE id IN (${batch.map(() => "?").join(", ")})`,
    )
      .bind(...batch.map((item) => item.id))
      .all<{ id: string; description: string | null }>()
    const byId = new Map(bodies.results.map((row) => [row.id, row.description ?? ""]))
    for (const item of batch) {
      item.input.description = byId.get(item.id) ?? ""
    }
  }

  const scores = await scoreInBatches(
    batch.map((item) => item.input),
    profile,
    await resolveScoringConfig(env),
  )
  for (const item of scores) {
    const verdict = {
      score: item.score,
      score_reason: item.reason,
      flags: JSON.stringify(item.flags),
    }
    await applyVerdict(item.external_id, verdict)
    const scored = batch.find((row) => row.id === item.external_id)
    for (const twin of (scored?.dedup_key && awaiting.get(scored.dedup_key)) || []) {
      await applyVerdict(twin, verdict)
    }

    if (scored) {
      await env.DB.prepare(
        `UPDATE discovered_companies
         SET best_score = CASE WHEN best_score IS NULL OR best_score < ? THEN ? ELSE best_score END
         WHERE company_key = ?`,
      )
        .bind(item.score, item.score, scored.company_key)
        .run()
    }
  }

  const cold = await env.DB.prepare(
    `SELECT id FROM sources WHERE bootstrapped = 0 AND deleted_at IS NULL`,
  ).all<{ id: number }>()
  for (const source of cold.results) {
    // A brand-new source arrives with its whole backlog, which would make one huge digest.
    // Mark it as already delivered rather than ignored, so it still shows up in the admin.
    await env.DB.prepare(
      `UPDATE jobs SET notified_at = datetime('now')
       WHERE source_id = ? AND status = 'new' AND notified_at IS NULL`,
    )
      .bind(source.id)
      .run()
    await env.DB.prepare(`UPDATE sources SET bootstrapped = 1 WHERE id = ?`).bind(source.id).run()
  }

  return { scored: scores.length, remaining }
}

const ID_CHUNK = 40

async function updateIds(env: Bindings, ids: string[], sql: string): Promise<void> {
  for (let i = 0; i < ids.length; i += ID_CHUNK) {
    const chunk = ids.slice(i, i + ID_CHUNK)
    await env.DB.prepare(`${sql} (${chunk.map(() => "?").join(", ")})`)
      .bind(...chunk)
      .run()
  }
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

  await updateIds(
    env,
    drop,
    `UPDATE jobs SET score = 0, score_reason = 'prefilter', flags = '[]', status = 'off_profile', description = NULL WHERE id IN`,
  )
  await updateIds(
    env,
    restore,
    `UPDATE jobs SET score = NULL, score_reason = NULL, flags = NULL, status = 'new' WHERE status = 'off_profile' AND id IN`,
  )
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
  const rows = await env.DB.prepare(
    `SELECT j.company, j.title, j.url, MAX(j.score) AS score, j.score_reason as reason, j.flags, j.id,
            s.tier, j.dedup_key, MAX(j.salary_min) AS salary_min, MAX(j.salary_max) AS salary_max,
            MIN(j.salary_currency) AS salary_currency
     FROM jobs j JOIN sources s ON s.id = j.source_id
     WHERE j.notified_at IS NULL AND j.closed_at IS NULL AND j.status = 'new' AND j.score IS NOT NULL
       AND (
         (s.tier = 'watchlist' AND j.score >= 55) OR
         (s.tier = 'discovery' AND j.score >= 70)
       )
     GROUP BY COALESCE(j.dedup_key, j.id)
     ORDER BY score DESC
     LIMIT 25`,
  ).all<{
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

export async function addDiscovered(env: Bindings, key: string): Promise<{ added: boolean; ats: string | null }> {
  const row = await env.DB.prepare(`SELECT * FROM discovered_companies WHERE company_key = ?`).bind(key).first<{
    company: string
    sample_url: string | null
    careers_url: string | null
  }>()
  if (!row) throw new Error("not found")
  const url = row.careers_url ?? row.sample_url
  if (url) {
    const detected = await detectUrl(url, env)
    if (detected.ats && detected.token && detected.ok) {
      await env.DB.prepare(
        `INSERT INTO sources (kind, tier, label, provider, token, careers_url, bootstrapped)
         VALUES ('company', 'watchlist', ?, ?, ?, ?, 0)
         ON CONFLICT(provider, token) DO UPDATE SET deleted_at = NULL, enabled = 1, label = excluded.label`,
      )
        .bind(row.company, detected.ats, detected.token, url)
        .run()
      await env.DB.prepare(`UPDATE discovered_companies SET state = 'added', detected_ats = ? WHERE company_key = ?`)
        .bind(detected.ats, key)
        .run()
      return { added: true, ats: detected.ats }
    }
  }
  await env.DB.prepare(`UPDATE discovered_companies SET state = 'added' WHERE company_key = ?`).bind(key).run()
  return { added: false, ats: null }
}
