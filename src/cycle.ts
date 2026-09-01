import { notifyNew, pickSources, prefilterAndScore, runSource } from "./ingest"
import type { Bindings, SourceRow } from "./types"

const SCORE_CHUNK = 30
const MAX_HOPS = 1000

export type CyclePhase = "sources" | "scoring" | "digest"
export type CycleStatus = "idle" | "running" | "done" | "error"

type Planned = { id: number; label: string }

type CycleRow = {
  status: CycleStatus
  phase: CyclePhase
  source_ids: string
  cursor: number
  total: number
  source_total: number
  done: number
  current_label: string | null
  current_id: number | null
  found: number
  fresh: number
  failed: number
  scored: number
  notified: number
  hops: number
  error: string | null
  origin: string | null
  started_at: string | null
  updated_at: string | null
  finished_at: string | null
}

export type CycleView = {
  status: CycleStatus
  phase: CyclePhase
  done: number
  total: number
  source_total: number
  current: string
  current_id: number | null
  found: number
  fresh: number
  failed: number
  scored: number
  notified: number
  error: string | null
  updated_at: string | null
}

function planned(raw: string): Planned[] {
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (item): item is Planned =>
        Boolean(item) && typeof item === "object" && typeof (item as Planned).id === "number",
    )
  } catch {
    return []
  }
}

function view(row: CycleRow): CycleView {
  return {
    status: row.status,
    phase: row.phase,
    done: row.done,
    total: row.total,
    source_total: row.source_total,
    current: row.current_label ?? "",
    current_id: row.current_id,
    found: row.found,
    fresh: row.fresh,
    failed: row.failed,
    scored: row.scored,
    notified: row.notified,
    error: row.error,
    updated_at: row.updated_at,
  }
}

async function loadRow(env: Bindings): Promise<CycleRow | null> {
  return env.DB.prepare(`SELECT * FROM cycles WHERE id = 1`).first<CycleRow>()
}

export async function loadCycleView(env: Bindings): Promise<CycleView> {
  const row = await loadRow(env)
  if (!row) {
    return {
      status: "idle",
      phase: "sources",
      done: 0,
      total: 0,
      source_total: 0,
      current: "",
      current_id: null,
      found: 0,
      fresh: 0,
      failed: 0,
      scored: 0,
      notified: 0,
      error: null,
      updated_at: null,
    }
  }
  return view(row)
}

export async function failCycle(env: Bindings, error: unknown): Promise<void> {
  const message = error instanceof Error ? error.message : String(error)
  await env.DB.prepare(
    `UPDATE cycles SET status = 'error', error = ?, current_label = NULL, current_id = NULL,
       updated_at = datetime('now'), finished_at = datetime('now')
     WHERE id = 1 AND status = 'running'`,
  )
    .bind(message)
    .run()
}

/**
 * Starts a cycle, or leaves a live one alone so a second click / a stale poll
 * can re-kick the chain without wiping progress.
 */
export async function startCycle(env: Bindings, origin?: string): Promise<CycleView> {
  const current = await loadRow(env)
  if (current?.status === "running") {
    if (origin && !current.origin) {
      await env.DB.prepare(`UPDATE cycles SET origin = ? WHERE id = 1`).bind(origin).run()
    }
    return view(current)
  }

  const sources = await pickSources(env)
  const items = sources.map((source) => ({ id: source.id, label: source.label }))
  const phase: CyclePhase = items.length === 0 ? "scoring" : "sources"
  await env.DB.prepare(
    `UPDATE cycles SET
       status = 'running', phase = ?, source_ids = ?, cursor = 0,
       total = ?, source_total = ?, done = 0,
       current_label = NULL, current_id = NULL,
       found = 0, fresh = 0, failed = 0, scored = 0, notified = 0, hops = 0,
       error = NULL, origin = ?,
       started_at = datetime('now'), updated_at = datetime('now'), finished_at = NULL
     WHERE id = 1`,
  )
    .bind(phase, JSON.stringify(items), items.length, items.length, origin ?? current?.origin ?? null)
    .run()

  const row = await loadRow(env)
  return row ? view(row) : await loadCycleView(env)
}

async function finish(env: Bindings, notified: number): Promise<void> {
  await env.DB.prepare(
    `UPDATE cycles SET status = 'done', phase = 'digest', notified = ?,
       current_label = NULL, current_id = NULL,
       updated_at = datetime('now'), finished_at = datetime('now')
     WHERE id = 1`,
  )
    .bind(notified)
    .run()
}

async function advance(env: Bindings, row: CycleRow): Promise<boolean> {
  if (row.phase === "sources") {
    const sources = planned(row.source_ids)
    if (row.cursor >= sources.length) {
      await env.DB.prepare(
        `UPDATE cycles SET phase = 'scoring', done = 0, total = 0,
           current_label = NULL, current_id = NULL, updated_at = datetime('now')
         WHERE id = 1`,
      ).run()
      return true
    }

    const item = sources[row.cursor]
    if (!item) {
      await env.DB.prepare(
        `UPDATE cycles SET phase = 'scoring', done = 0, total = 0,
           current_label = NULL, current_id = NULL, updated_at = datetime('now')
         WHERE id = 1`,
      ).run()
      return true
    }
    await env.DB.prepare(
      `UPDATE cycles SET current_label = ?, current_id = ?, updated_at = datetime('now') WHERE id = 1`,
    )
      .bind(item.label, item.id)
      .run()

    const source = await env.DB.prepare(`SELECT * FROM sources WHERE id = ?`).bind(item.id).first<SourceRow>()
    const run = source
      ? await runSource(env, source)
      : { ok: false, jobs_found: 0, jobs_new: 0 }

    await env.DB.prepare(
      `UPDATE cycles SET
         cursor = cursor + 1, done = done + 1,
         found = found + ?, fresh = fresh + ?, failed = failed + ?,
         current_label = NULL, current_id = NULL, updated_at = datetime('now')
       WHERE id = 1`,
    )
      .bind(run.jobs_found, run.jobs_new, run.ok ? 0 : 1)
      .run()
    return true
  }

  if (row.phase === "scoring") {
    const step = await prefilterAndScore(env, SCORE_CHUNK)
    const scored = row.scored + step.scored
    const remaining = step.remaining
    const doneScoring = remaining === 0 || step.scored === 0
    await env.DB.prepare(
      doneScoring
        ? `UPDATE cycles SET scored = ?, done = ?, total = ?, phase = 'digest',
             current_label = NULL, current_id = NULL, updated_at = datetime('now')
           WHERE id = 1`
        : `UPDATE cycles SET scored = ?, done = ?, total = ?,
             current_label = NULL, current_id = NULL, updated_at = datetime('now')
           WHERE id = 1`,
    )
      .bind(scored, scored, scored + remaining)
      .run()
    return true
  }

  const notified = await notifyNew(env)
  await finish(env, notified)
  return false
}

/** One source, one scoring chunk, or the digest. Returns whether another hop is needed. */
export async function tickOnce(env: Bindings): Promise<boolean> {
  const row = await loadRow(env)
  if (!row || row.status !== "running") return false
  if (row.hops >= MAX_HOPS) {
    await failCycle(env, "cycle exceeded hop limit")
    return false
  }

  const cas = await env.DB.prepare(
    `UPDATE cycles SET hops = hops + 1, updated_at = datetime('now')
     WHERE id = 1 AND status = 'running' AND hops = ?`,
  )
    .bind(row.hops)
    .run()
  if (!Number(cas.meta.changes)) return false

  const fresh = await loadRow(env)
  if (!fresh || fresh.status !== "running") return false

  try {
    return await advance(env, fresh)
  } catch (error) {
    await failCycle(env, error)
    return false
  }
}

/** Kick the next hop as its own Worker invocation so this one can finish. */
export function enqueueTick(env: Bindings, ctx: { waitUntil(promise: Promise<unknown>): void }): void {
  ctx.waitUntil(runTickHop(env, ctx))
}

async function runTickHop(
  env: Bindings,
  ctx: { waitUntil(promise: Promise<unknown>): void },
): Promise<void> {
  try {
    if (env.SELF) {
      const res = await env.SELF.fetch(
        new Request("https://jobradar.internal/api/run/tick", {
          method: "POST",
          headers: { Authorization: `Bearer ${env.ADMIN_TOKEN}` },
        }),
      )
      if (res.ok) return
      const body = await res.text().catch(() => "")
      await failCycle(env, `tick failed: ${res.status} ${body.slice(0, 200)}`)
      return
    }

    const more = await tickOnce(env)
    if (more) enqueueTick(env, ctx)
  } catch (error) {
    await failCycle(env, error)
  }
}

export function requestOrigin(url: string): string {
  return new URL(url).origin
}
