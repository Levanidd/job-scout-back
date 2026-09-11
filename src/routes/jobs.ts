import { Hono } from "hono"

import { currentUser } from "../auth"
import { message } from "../errors"
import { createManualJob, scoreJobsByIds, scoreOneJob } from "../ingest"
import type { AppEnv } from "../types"
import { JOB_COLUMNS, JOB_SOURCE, appliedFilters, jobFilters, jobOrder } from "./job-query"

export const jobs = new Hono<AppEnv>()

const STATUSES = ["new", "notified", "saved", "applied", "interview", "rejected", "ignored", "off_profile"]

jobs.get("/api/applied", async (c) => {
  const userId = currentUser(c).id
  const { clauses, binds } = await appliedFilters(c)
  const rows = await c.env.DB.prepare(
    `SELECT ${JOB_COLUMNS}, uj.notes, s.tier, s.label as source_label
     ${JOB_SOURCE}
     WHERE ${clauses}
     ORDER BY uj.applied_at DESC
     LIMIT 200`,
  )
    .bind(userId, ...binds)
    .all()
  return c.json({ jobs: rows.results })
})

jobs.post("/api/applied", async (c) => {
  const body = await c.req.json<Record<string, unknown>>().catch(() => ({}) as Record<string, unknown>)
  const text = (key: string) => (typeof body[key] === "string" ? (body[key] as string) : undefined)
  try {
    const job = await createManualJob(
      c.env,
      {
        title: String(body.title ?? ""),
        company: String(body.company ?? ""),
        url: String(body.url ?? ""),
        location: text("location"),
        description: text("description"),
        notes: text("notes"),
        salary_min: body.salary_min,
        salary_max: body.salary_max,
        salary_currency: text("salary_currency"),
        status: text("status"),
        applied_at: text("applied_at"),
      },
      currentUser(c).id,
    )
    return c.json({ job }, 201)
  } catch (error) {
    return c.json({ error: message(error) }, 400)
  }
})

jobs.get("/api/jobs", async (c) => {
  const userId = currentUser(c).id
  const { clauses, binds } = await jobFilters(c, true)
  const rows = await c.env.DB.prepare(
    `SELECT ${JOB_COLUMNS}, s.tier, s.label as source_label
     ${JOB_SOURCE}
     WHERE ${clauses}
     ORDER BY ${jobOrder(c)}
     LIMIT 500`,
  )
    .bind(userId, ...binds)
    .all()
  return c.json({ jobs: rows.results })
})

jobs.get("/api/jobs/companies", async (c) => {
  const userId = currentUser(c).id
  const { clauses, binds } = await jobFilters(c, false)
  const rows = await c.env.DB.prepare(
    `SELECT j.company_key, MIN(j.company) AS company, COUNT(*) AS jobs
     ${JOB_SOURCE}
     WHERE ${clauses}
     GROUP BY j.company_key
     ORDER BY company COLLATE NOCASE`,
  )
    .bind(userId, ...binds)
    .all()
  return c.json({ companies: rows.results })
})

jobs.post("/api/jobs/score", async (c) => {
  const body = await c.req.json<{ ids?: string[] }>().catch(() => ({}) as { ids?: string[] })
  const ids = Array.isArray(body.ids) ? body.ids.map(String) : []
  if (ids.length === 0) return c.json({ error: "ids required" }, 400)
  try {
    return c.json({ jobs: await scoreJobsByIds(c.env, ids, currentUser(c).id) })
  } catch (error) {
    const detail = message(error)
    return c.json({ error: detail }, detail === "not found" ? 404 : 502)
  }
})

jobs.get("/api/jobs/:id", async (c) => {
  const row = await c.env.DB.prepare(
    `SELECT ${JOB_COLUMNS}, j.description, uj.notes, s.tier, s.label as source_label
     ${JOB_SOURCE}
     WHERE j.id = ?`,
  )
    .bind(currentUser(c).id, c.req.param("id"))
    .first()
  if (!row) return c.json({ error: "not found" }, 404)
  return c.json({ job: row })
})

jobs.patch("/api/jobs/:id", async (c) => {
  const id = c.req.param("id")
  const userId = currentUser(c).id
  const body = await c.req.json<{ status?: string; notes?: string; viewed?: boolean; later?: boolean }>()
  if (body.status && !STATUSES.includes(body.status)) return c.json({ error: "bad status" }, 400)
  if (
    body.status === undefined &&
    body.notes === undefined &&
    typeof body.viewed !== "boolean" &&
    typeof body.later !== "boolean"
  ) {
    return c.json({ error: "nothing to update" }, 400)
  }

  const exists = await c.env.DB.prepare(`SELECT id FROM jobs WHERE id = ?`).bind(id).first<{ id: string }>()
  if (!exists) return c.json({ error: "not found" }, 404)

  await c.env.DB.prepare(`INSERT OR IGNORE INTO user_jobs (user_id, job_id) VALUES (?, ?)`).bind(userId, id).run()

  const sets: string[] = []
  const binds: (string | null)[] = []
  if (body.status) {
    sets.push("status = ?")
    binds.push(body.status)
    if (body.status === "applied" || body.status === "interview") {
      sets.push("applied_at = COALESCE(applied_at, datetime('now'))")
    } else if (body.status !== "rejected") {
      sets.push("applied_at = NULL")
    }
  }
  if (body.notes !== undefined) {
    sets.push("notes = ?")
    binds.push(body.notes)
  }
  if (typeof body.viewed === "boolean") {
    sets.push(body.viewed ? "viewed_at = COALESCE(viewed_at, datetime('now'))" : "viewed_at = NULL")
  }
  if (typeof body.later === "boolean") {
    sets.push(body.later ? "later_at = COALESCE(later_at, datetime('now'))" : "later_at = NULL")
  }

  await c.env.DB.prepare(`UPDATE user_jobs SET ${sets.join(", ")} WHERE user_id = ? AND job_id = ?`)
    .bind(...binds, userId, id)
    .run()

  const row = await c.env.DB.prepare(
    `SELECT status, notes, applied_at, viewed_at, later_at FROM user_jobs WHERE user_id = ? AND job_id = ?`,
  )
    .bind(userId, id)
    .first<{
      status: string
      notes: string | null
      applied_at: string | null
      viewed_at: string | null
      later_at: string | null
    }>()
  return c.json({
    ok: true,
    status: row?.status ?? body.status ?? "",
    notes: row?.notes ?? null,
    applied_at: row?.applied_at ?? null,
    viewed_at: row?.viewed_at ?? null,
    later_at: row?.later_at ?? null,
  })
})

jobs.post("/api/jobs/:id/score", async (c) => {
  try {
    return c.json(await scoreOneJob(c.env, c.req.param("id"), currentUser(c).id))
  } catch (error) {
    const detail = message(error)
    return c.json({ error: detail }, detail === "not found" ? 404 : 502)
  }
})
