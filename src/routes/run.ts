import { Hono } from "hono"

import { currentUser } from "../auth"
import { enqueueTick, loadCycleView, requestOrigin, startCycle, tickOnce } from "../cycle"
import { notifyNew, pickSources, prefilterAndScore } from "../ingest"
import type { AppEnv } from "../types"

export const run = new Hono<AppEnv>()

run.get("/api/run", async (c) => c.json(await loadCycleView(c.env)))

run.post("/api/run", async (c) => {
  const cycle = await startCycle(c.env, requestOrigin(c.req.url), currentUser(c).id)
  enqueueTick(c.env, c.executionCtx)
  return c.json(cycle)
})

run.post("/api/run/tick", async (c) => {
  const more = await tickOnce(c.env)
  if (more) enqueueTick(c.env, c.executionCtx)
  return c.json({ ok: true, more })
})

run.get("/api/run/plan", async (c) => {
  const sources = await pickSources(c.env)
  return c.json({
    sources: sources.map((source) => ({
      id: source.id,
      label: source.label,
      provider: source.provider,
      tier: source.tier,
    })),
  })
})

run.post("/api/score", async (c) => {
  const body = await c.req.json<{ limit?: number }>().catch(() => ({}) as { limit?: number })
  const limit = Number(body.limit) > 0 ? Number(body.limit) : undefined
  return c.json(await prefilterAndScore(c.env, currentUser(c).id, limit))
})

run.post("/api/notify", async (c) => c.json({ notified: await notifyNew(c.env) }))

run.get("/api/runs", async (c) => {
  const rows = await c.env.DB.prepare(
    `SELECT r.*, s.label, s.provider FROM source_runs r
     JOIN sources s ON s.id = r.source_id
     ORDER BY r.id DESC LIMIT 50`,
  ).all()
  return c.json({ runs: rows.results })
})
