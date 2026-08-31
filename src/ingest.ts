import { getAdapter } from "./adapters"
import { companyKey, dedupKey, jobHash } from "./company-key"
import { detectUrl } from "./detect"
import { renderDigest, sendTelegram } from "./notify"
import { clipDescription, passesPrefilter } from "./prefilter"
import { scoreInBatches, type ScoreInput } from "./scoring"
import { resolveScoringConfig } from "./settings"
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

async function loadSources(db: D1Database): Promise<SourceRow[]> {
  const res = await db
    .prepare(
      `SELECT * FROM sources WHERE enabled = 1 AND deleted_at IS NULL
       ORDER BY last_run_at ASC NULLS FIRST`,
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
      const existing = await env.DB.prepare(`SELECT id FROM jobs WHERE id = ?`).bind(id).first<{ id: string }>()
      if (!existing) jobsNew += 1
      const description = clipDescription(job.description) ?? null
      await env.DB.prepare(
        `INSERT INTO jobs (id, source_id, external_id, company, company_key, title, location, url, description, posted_at, dedup_key, first_seen_at, last_seen_at, closed_at, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'), NULL, 'new')
         ON CONFLICT(id) DO UPDATE SET
           last_seen_at = datetime('now'),
           title = excluded.title,
           location = excluded.location,
           dedup_key = excluded.dedup_key,
           closed_at = NULL,
           description = COALESCE(excluded.description, jobs.description)`,
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
          dedupKey(company, job.title) || null,
        )
        .run()

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
  const rows = await db
    .prepare(`SELECT label FROM sources WHERE deleted_at IS NULL AND kind = 'company'`)
    .all<{ label: string }>()
  return new Set(rows.results.map((row) => companyKey(row.label)))
}

export async function prefilterAndScore(env: Bindings): Promise<number> {
  const open = await env.DB.prepare(
    `SELECT * FROM jobs WHERE closed_at IS NULL AND (score IS NULL OR status = 'new')`,
  ).all<{
    id: string
    source_id: number
    external_id: string
    company: string
    company_key: string
    title: string
    location: string | null
    description: string | null
    score: number | null
    status: string
    dedup_key: string | null
  }>()

  const profileRow = await env.DB.prepare(`SELECT content FROM profile WHERE id = 1`).first<{ content: string }>()
  const profile = profileRow?.content ?? ""

  // A role we already judged on one board is the same role on the next one, so
  // its verdict carries over instead of being bought again.
  const judged = await env.DB.prepare(
    `SELECT dedup_key, MAX(score) AS score, score_reason, flags FROM jobs
     WHERE dedup_key IS NOT NULL AND score IS NOT NULL
     GROUP BY dedup_key`,
  ).all<{ dedup_key: string; score: number; score_reason: string | null; flags: string | null }>()
  const verdicts = new Map(judged.results.map((row) => [row.dedup_key, row]))

  const toScore: ScoreInput[] = []
  /** Twins of a job that is being scored right now, waiting for its verdict. */
  const awaiting = new Map<string, string[]>()

  const applyVerdict = async (
    id: string,
    verdict: { score: number; score_reason: string | null; flags: string | null },
  ) => {
    await env.DB.prepare(`UPDATE jobs SET score = ?, score_reason = ?, flags = ? WHERE id = ?`)
      .bind(verdict.score, verdict.score_reason, verdict.flags, id)
      .run()
  }

  for (const job of open.results) {
    if (job.status === "ignored" || job.status === "rejected") continue
    if (!passesPrefilter(job.title)) {
      await env.DB.prepare(
        `UPDATE jobs SET score = 0, score_reason = 'prefilter', flags = '[]', status = 'ignored', description = NULL WHERE id = ?`,
      )
        .bind(job.id)
        .run()
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
      external_id: job.id,
      title: job.title,
      company: job.company,
      location: job.location ?? "",
      description: job.description ?? "",
    })
  }

  const scores = await scoreInBatches(toScore, profile, await resolveScoringConfig(env))
  for (const item of scores) {
    const verdict = {
      score: item.score,
      score_reason: item.reason,
      flags: JSON.stringify(item.flags),
    }
    await applyVerdict(item.external_id, verdict)
    const scored = open.results.find((row) => row.id === item.external_id)
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

  return scores.length
}

export async function notifyNew(env: Bindings): Promise<number> {
  // One line per opening, not per board that carries it. Grouping on the
  // dedup key keeps the copy from the employer's own board, whose link goes
  // straight to the posting rather than through an aggregator.
  const rows = await env.DB.prepare(
    `SELECT j.company, j.title, j.url, MAX(j.score) AS score, j.score_reason as reason, j.flags, j.id,
            s.tier, j.dedup_key
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
  const all = await loadSources(env.DB)
  const watchlist = all.filter((row) => row.tier === "watchlist")
  const discovery = all.filter((row) => row.tier === "discovery")
  const watch = watchlist.length < 20 ? watchlist : watchlist.slice(0, 8)
  return [...watch, ...discovery.slice(0, 6)]
}

export async function runCycle(env: Bindings): Promise<{ runs: RunResult[]; scored: number; notified: number }> {
  const selected = await pickSources(env)
  const runs: RunResult[] = []
  for (const source of selected) {
    runs.push(await runSource(env, source))
  }
  const scored = await prefilterAndScore(env)
  const notified = await notifyNew(env)
  return { runs, scored, notified }
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
