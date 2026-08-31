import { Hono, type Context } from "hono"
import { cors } from "hono/cors"

import { adapters } from "./adapters"
import { addDiscovered, notifyNew, pickSources, prefilterAndScore, runCycle, runSource } from "./ingest"
import { detectUrl } from "./detect"
import { isThinkingLevel, listModels, validateModel, type ThinkingLevel } from "./scoring"
import { SETTING_MODEL, SETTING_THINKING, settingsView, writeSetting } from "./settings"
import type { Bindings, SourceRow } from "./types"

const app = new Hono<{ Bindings: Bindings }>()

app.use("/api/*", cors())

app.use("/api/*", async (c, next) => {
  if (c.req.path === "/api/health") return next()
  const expected = c.env.ADMIN_TOKEN
  if (!expected) return c.json({ error: "ADMIN_TOKEN is not configured" }, 500)
  const header = c.req.header("Authorization") ?? ""
  const token = header.startsWith("Bearer ") ? header.slice(7) : ""
  if (token !== expected) return c.json({ error: "unauthorized" }, 401)
  return next()
})

app.get("/api/health", (c) =>
  c.json({ ok: true, service: "jobradar", time: new Date().toISOString() }),
)

app.get("/api/sources", async (c) => {
  const rows = await c.env.DB.prepare(
    `SELECT s.id, s.kind, s.tier, s.label, s.provider, s.token, s.careers_url, s.enabled,
       s.last_count, s.bootstrapped, s.deleted_at, s.created_at,
       COALESCE(s.last_run_at, (SELECT MAX(j.last_seen_at) FROM jobs j WHERE j.source_id = s.id)) AS last_run_at,
       (SELECT COUNT(*) FROM jobs j WHERE j.source_id = s.id AND j.closed_at IS NULL) AS active_jobs,
       (SELECT error FROM source_runs r WHERE r.source_id = s.id ORDER BY r.id DESC LIMIT 1) AS last_error,
       COALESCE(
         (SELECT ok FROM source_runs r WHERE r.source_id = s.id ORDER BY r.id DESC LIMIT 1),
         CASE WHEN EXISTS (SELECT 1 FROM jobs j WHERE j.source_id = s.id) THEN 1 END
       ) AS last_ok
     FROM sources s WHERE s.deleted_at IS NULL ORDER BY s.tier, s.label`,
  ).all()
  return c.json({ sources: rows.results })
})

app.post("/api/sources", async (c) => {
  const body = await c.req.json<{
    kind?: "company" | "query"
    tier?: "watchlist" | "discovery"
    label: string
    provider: string
    token: string
    careers_url?: string
  }>()
  if (!body.label || !body.provider || !body.token) {
    return c.json({ error: "label, provider, token required" }, 400)
  }
  await c.env.DB.prepare(
    `INSERT INTO sources (kind, tier, label, provider, token, careers_url)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(provider, token) DO UPDATE SET
       deleted_at = NULL, enabled = 1, label = excluded.label, tier = excluded.tier, careers_url = excluded.careers_url`,
  )
    .bind(
      // The adapter knows whether its token is a company board or a search
      // query; the admin never sends this, and a query feed filed as a company
      // never feeds Discovery.
      body.kind ?? adapters.find((item) => item.provider === body.provider)?.kind ?? "company",
      body.tier ?? "watchlist",
      body.label,
      body.provider,
      body.token,
      body.careers_url ?? null,
    )
    .run()
  return c.json({ ok: true })
})

app.patch("/api/sources/:id", async (c) => {
  const id = Number(c.req.param("id"))
  const body = await c.req.json<{ enabled?: number; tier?: string; label?: string }>()
  const current = await c.env.DB.prepare(`SELECT * FROM sources WHERE id = ?`).bind(id).first<SourceRow>()
  if (!current) return c.json({ error: "not found" }, 404)
  await c.env.DB.prepare(`UPDATE sources SET enabled = ?, tier = ?, label = ? WHERE id = ?`)
    .bind(body.enabled ?? current.enabled, body.tier ?? current.tier, body.label ?? current.label, id)
    .run()
  return c.json({ ok: true })
})

app.delete("/api/sources/:id", async (c) => {
  const id = Number(c.req.param("id"))
  await c.env.DB.prepare(`UPDATE sources SET deleted_at = datetime('now'), enabled = 0 WHERE id = ?`).bind(id).run()
  return c.json({ ok: true })
})

// `?score=0` leaves the queue alone: a full cycle scores once at the end
// instead of after every source, and the admin can report progress meanwhile.
app.post("/api/sources/:id/run", async (c) => {
  const id = Number(c.req.param("id"))
  const source = await c.env.DB.prepare(`SELECT * FROM sources WHERE id = ?`).bind(id).first<SourceRow>()
  if (!source) return c.json({ error: "not found" }, 404)
  const run = await runSource(c.env, source)
  if (c.req.query("score") === "0") return c.json({ run, scored: 0 })
  const { scored } = await prefilterAndScore(c.env)
  return c.json({ run, scored })
})

app.post("/api/detect", async (c) => {
  const body = await c.req.json<{ url: string }>()
  if (!body.url) return c.json({ error: "url required" }, 400)
  const result = await detectUrl(body.url, c.env)
  return c.json(result)
})

app.post("/api/sources/bulk-detect", async (c) => {
  const body = await c.req.json<{ urls: string[] }>()
  const urls = body.urls ?? []
  const results = []
  for (const url of urls) {
    try {
      results.push({ url, ...(await detectUrl(url, c.env)) })
    } catch (error) {
      results.push({
        url,
        ats: null,
        token: null,
        ok: false,
        jobs_found: 0,
        sample: [],
        guessed: false,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }
  return c.json({ results })
})

app.get("/api/discovered", async (c) => {
  const state = c.req.query("state") ?? "new"
  // `hits` counts every pass of the ingest over a posting, not the postings
  // themselves, so the card shows what is actually stored and openable.
  const rows = await c.env.DB.prepare(
    `SELECT d.*,
       (SELECT COUNT(*) FROM jobs j WHERE j.company_key = d.company_key AND j.closed_at IS NULL) AS jobs_open
     FROM discovered_companies d
     WHERE d.state = ?
     ORDER BY d.best_score DESC NULLS LAST, jobs_open DESC`,
  )
    .bind(state)
    .all()
  return c.json({ companies: rows.results })
})

app.post("/api/discovered/:key/add", async (c) => {
  const key = c.req.param("key")
  try {
    const result = await addDiscovered(c.env, key)
    return c.json(result)
  } catch {
    return c.json({ error: "not found" }, 404)
  }
})

app.post("/api/discovered/:key/dismiss", async (c) => {
  const key = c.req.param("key")
  await c.env.DB.prepare(`UPDATE discovered_companies SET state = 'dismissed' WHERE company_key = ?`).bind(key).run()
  return c.json({ ok: true })
})

function jobFilters(c: Context<{ Bindings: Bindings }>, withCompanies: boolean) {
  const clauses = ["j.closed_at IS NULL"]
  const binds: (string | number)[] = []

  // Nothing is dropped from the list for good: the default view hides what the
  // prefilter and the user set aside, `any` brings the whole pile back.
  const status = c.req.query("status")
  if (status && status !== "any") {
    clauses.push("j.status = ?")
    binds.push(status)
  } else if (!status) {
    clauses.push("j.status NOT IN ('ignored', 'off_profile')")
  }

  const minScore = Number(c.req.query("min_score") ?? 0)
  if (minScore) {
    clauses.push("j.score >= ?")
    binds.push(minScore)
  }

  const tier = c.req.query("tier")
  if (tier) {
    clauses.push("s.tier = ?")
    binds.push(tier)
  }

  const companies = (c.req.query("companies") ?? "")
    .split(",")
    .map((key) => key.trim())
    .filter(Boolean)
  if (withCompanies && companies.length > 0) {
    clauses.push(`j.company_key IN (${companies.map(() => "?").join(", ")})`)
    binds.push(...companies)
  }

  const addedDays = Number(c.req.query("added_days") ?? 0)
  if (addedDays > 0) {
    clauses.push(`j.first_seen_at >= datetime('now', ?)`)
    binds.push(`-${addedDays} days`)
  }

  const addedFrom = (c.req.query("added_from") ?? "").trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(addedFrom)) {
    clauses.push(`j.first_seen_at >= ?`)
    binds.push(`${addedFrom} 00:00:00`)
  }

  return { clauses: clauses.join(" AND "), binds }
}

const JOB_ORDER: Record<string, string> = {
  applied: `(j.status = 'applied')`,
  title: "j.title COLLATE NOCASE",
  company: "j.company COLLATE NOCASE",
  score: "j.score",
  posted: "COALESCE(j.posted_at, j.first_seen_at)",
  updated: "j.last_seen_at",
  added: "j.first_seen_at",
}

function jobOrder(c: Context<{ Bindings: Bindings }>): string {
  const expr = JOB_ORDER[c.req.query("sort") ?? ""] ?? JOB_ORDER.score
  const dir = c.req.query("dir") === "asc" ? "ASC" : "DESC"
  return `${expr} ${dir} NULLS LAST, j.first_seen_at DESC`
}

// Descriptions run to kilobytes each and the list never shows them.
const JOB_COLUMNS = `j.id, j.source_id, j.company, j.company_key, j.title, j.location, j.url,
  j.posted_at, j.first_seen_at, j.last_seen_at, j.score, j.score_reason, j.flags, j.status`

app.get("/api/jobs", async (c) => {
  const { clauses, binds } = jobFilters(c, true)
  const sql = `SELECT ${JOB_COLUMNS}, s.tier, s.label as source_label
    FROM jobs j JOIN sources s ON s.id = j.source_id
    WHERE ${clauses}
    ORDER BY ${jobOrder(c)}
    LIMIT 500`
  const rows = await c.env.DB.prepare(sql).bind(...binds).all()
  return c.json({ jobs: rows.results })
})

// The company picker ignores its own selection, otherwise unpicking a company
// would be impossible once it dropped out of the list.
app.get("/api/jobs/companies", async (c) => {
  const { clauses, binds } = jobFilters(c, false)
  const sql = `SELECT j.company_key, MIN(j.company) AS company, COUNT(*) AS jobs
    FROM jobs j JOIN sources s ON s.id = j.source_id
    WHERE ${clauses}
    GROUP BY j.company_key
    ORDER BY company COLLATE NOCASE`
  const rows = await c.env.DB.prepare(sql).bind(...binds).all()
  return c.json({ companies: rows.results })
})

app.patch("/api/jobs/:id", async (c) => {
  const id = c.req.param("id")
  const body = await c.req.json<{ status: string }>()
  const allowed = ["new", "notified", "saved", "applied", "rejected", "ignored", "off_profile"]
  if (!allowed.includes(body.status)) return c.json({ error: "bad status" }, 400)
  await c.env.DB.prepare(`UPDATE jobs SET status = ? WHERE id = ?`).bind(body.status, id).run()
  return c.json({ ok: true })
})

app.get("/api/profile", async (c) => {
  const row = await c.env.DB.prepare(`SELECT content FROM profile WHERE id = 1`).first<{ content: string }>()
  return c.json({ content: row?.content ?? "" })
})

app.put("/api/profile", async (c) => {
  const body = await c.req.json<{ content: string }>()
  await c.env.DB.prepare(`INSERT INTO profile (id, content) VALUES (1, ?) ON CONFLICT(id) DO UPDATE SET content = excluded.content`)
    .bind(body.content)
    .run()
  return c.json({ ok: true })
})

app.post("/api/profile/rescore", async (c) => {
  await c.env.DB.prepare(
    `UPDATE jobs SET score = NULL, score_reason = NULL, flags = NULL
     WHERE closed_at IS NULL AND status NOT IN ('ignored', 'rejected', 'off_profile')`,
  ).run()
  const { scored } = await prefilterAndScore(c.env)
  return c.json({ ok: true, scored })
})

app.get("/api/settings", async (c) => c.json(await settingsView(c.env)))

app.get("/api/models", async (c) => {
  if (!c.env.GEMINI_API_KEY) return c.json({ models: [], error: "GEMINI_API_KEY is not configured" })
  try {
    return c.json({ models: await listModels(c.env.GEMINI_API_KEY) })
  } catch (error) {
    return c.json({ models: [], error: error instanceof Error ? error.message : String(error) }, 502)
  }
})

app.put("/api/settings", async (c) => {
  const body = await c.req.json<{ model?: string; thinking_level?: string }>()
  const model = body.model?.trim()
  const thinking = body.thinking_level?.trim()

  if (thinking && !isThinkingLevel(thinking)) return c.json({ error: "bad thinking_level" }, 400)
  if (!model && !thinking) return c.json({ error: "nothing to update" }, 400)

  if (model) {
    if (!c.env.GEMINI_API_KEY) return c.json({ error: "GEMINI_API_KEY is not configured" }, 400)
    const level: ThinkingLevel = isThinkingLevel(thinking ?? "")
      ? (thinking as ThinkingLevel)
      : (await settingsView(c.env)).thinking_level
    try {
      await validateModel(c.env.GEMINI_API_KEY, model, level)
    } catch (error) {
      return c.json({ error: error instanceof Error ? error.message : String(error) }, 400)
    }
    await writeSetting(c.env, SETTING_MODEL, model)
  }
  if (thinking) await writeSetting(c.env, SETTING_THINKING, thinking)

  return c.json(await settingsView(c.env))
})

app.post("/api/run", async (c) => {
  const result = await runCycle(c.env)
  return c.json(result)
})

// The three steps of a cycle, exposed separately so the admin can drive them
// one at a time and show where the run currently is. Splitting also gives each
// step its own subrequest budget, which one long request would have to share.
app.get("/api/run/plan", async (c) => {
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

app.post("/api/score", async (c) => {
  const body = await c.req.json<{ limit?: number }>().catch(() => ({}) as { limit?: number })
  const limit = Number(body.limit) > 0 ? Number(body.limit) : undefined
  return c.json(await prefilterAndScore(c.env, limit))
})

app.post("/api/notify", async (c) => c.json({ notified: await notifyNew(c.env) }))

app.get("/api/runs", async (c) => {
  const rows = await c.env.DB.prepare(
    `SELECT r.*, s.label, s.provider FROM source_runs r
     JOIN sources s ON s.id = r.source_id
     ORDER BY r.id DESC LIMIT 50`,
  ).all()
  return c.json({ runs: rows.results })
})

app.get("/", (c) =>
  c.json({
    service: "jobradar",
    health: "/api/health",
    auth: "Authorization: Bearer <ADMIN_TOKEN>",
  }),
)

app.all("*", (c) => c.json({ error: "not found" }, 404))

// Kept wired for the day cron comes back; wrangler.toml currently schedules nothing.
export default {
  fetch: app.fetch,
  async scheduled(_event: ScheduledEvent, env: Bindings, ctx: ExecutionContext) {
    ctx.waitUntil(runCycle(env).then(() => undefined))
  },
}
