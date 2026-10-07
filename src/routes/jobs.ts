import { Hono } from "hono"

import { currentUser } from "../auth"
import { message } from "../errors"
import { createManualJob, scoreJobsByIds, scoreOneJob, setPrimaryListing } from "../ingest"
import type { AppEnv } from "../types"
import { JOB_COLUMNS, JOB_SOURCE, appliedFilters, jobFilters, jobOrder } from "./job-query"

export const jobs = new Hono<AppEnv>()

const STATUSES = ["new", "notified", "saved", "applied", "interview", "rejected", "ignored", "off_profile"]

/** Empty clears the link; anything that is not an http(s) URL is refused, since the card opens it. */
function cleanCvUrl(raw: unknown): string | null | false {
  if (raw === null) return null
  if (typeof raw !== "string") return false
  const value = raw.trim()
  if (!value) return null
  try {
    const url = new URL(value)
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : false
  } catch {
    return false
  }
}

type DuplicateListing = {
  id: string
  url: string
  title: string
  company: string
  source_label: string
  kind: string
  first_seen_at: string
  duplicate_of: string | null
}

async function loadJobDetail(env: AppEnv["Bindings"], userId: number, id: string) {
  const row = await env.DB.prepare(
    `SELECT ${JOB_COLUMNS}, j.description, uj.notes, uj.cv_url, uj.claude_comment, s.tier, s.label as source_label
     ${JOB_SOURCE}
     WHERE j.id = ?`,
  )
    .bind(userId, id)
    .first<Record<string, unknown> & { duplicate_of: string | null }>()
  if (!row) return null

  const root = row.duplicate_of || id
  const group = await env.DB.prepare(
    `SELECT j.id, j.url, j.title, j.company, j.first_seen_at, j.duplicate_of,
            s.label as source_label, s.kind
     FROM jobs j JOIN sources s ON s.id = j.source_id
     WHERE j.id = ? OR j.duplicate_of = ?
     ORDER BY j.duplicate_of IS NULL DESC, j.first_seen_at ASC`,
  )
    .bind(root, root)
    .all<DuplicateListing>()

  const duplicates = group.results.map((item) => ({
    id: item.id,
    url: item.url,
    title: item.title,
    company: item.company,
    source_label: item.source_label,
    kind: item.kind,
    first_seen_at: item.first_seen_at,
    primary: !item.duplicate_of,
  }))
  return { ...row, duplicates }
}

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
  const job = await loadJobDetail(c.env, currentUser(c).id, c.req.param("id"))
  if (!job) return c.json({ error: "not found" }, 404)
  return c.json({ job })
})

jobs.patch("/api/jobs/:id", async (c) => {
  const id = c.req.param("id")
  const userId = currentUser(c).id
  const body = await c.req.json<{
    status?: string
    notes?: string
    viewed?: boolean
    later?: boolean
    cv_url?: string | null
    claude_comment?: string | null
  }>()
  if (body.status && !STATUSES.includes(body.status)) return c.json({ error: "bad status" }, 400)
  const cvUrl = body.cv_url === undefined ? undefined : cleanCvUrl(body.cv_url)
  if (cvUrl === false) return c.json({ error: "cv_url must be an http(s) link" }, 400)
  if (body.claude_comment !== undefined && body.claude_comment !== null && typeof body.claude_comment !== "string") {
    return c.json({ error: "claude_comment must be text" }, 400)
  }
  if (
    body.status === undefined &&
    body.notes === undefined &&
    typeof body.viewed !== "boolean" &&
    typeof body.later !== "boolean" &&
    cvUrl === undefined &&
    body.claude_comment === undefined
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
    if (body.status === "interview") {
      sets.push("interviewed_at = COALESCE(interviewed_at, datetime('now'))")
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
  if (cvUrl !== undefined) {
    sets.push("cv_url = ?")
    binds.push(cvUrl)
  }
  if (body.claude_comment !== undefined) {
    sets.push("claude_comment = ?")
    binds.push(body.claude_comment?.trim() || null)
  }

  await c.env.DB.prepare(`UPDATE user_jobs SET ${sets.join(", ")} WHERE user_id = ? AND job_id = ?`)
    .bind(...binds, userId, id)
    .run()

  const row = await c.env.DB.prepare(
    `SELECT status, notes, applied_at, viewed_at, later_at, interviewed_at, cv_url, claude_comment
     FROM user_jobs WHERE user_id = ? AND job_id = ?`,
  )
    .bind(userId, id)
    .first<{
      status: string
      notes: string | null
      applied_at: string | null
      viewed_at: string | null
      later_at: string | null
      interviewed_at: string | null
      cv_url: string | null
      claude_comment: string | null
    }>()
  return c.json({
    ok: true,
    status: row?.status ?? body.status ?? "",
    notes: row?.notes ?? null,
    applied_at: row?.applied_at ?? null,
    viewed_at: row?.viewed_at ?? null,
    later_at: row?.later_at ?? null,
    interviewed_at: row?.interviewed_at ?? null,
    cv_url: row?.cv_url ?? null,
    claude_comment: row?.claude_comment ?? null,
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

jobs.post("/api/jobs/:id/primary", async (c) => {
  const id = c.req.param("id")
  const exists = await c.env.DB.prepare(`SELECT id FROM jobs WHERE id = ?`).bind(id).first<{ id: string }>()
  if (!exists) return c.json({ error: "not found" }, 404)
  const ok = await setPrimaryListing(c.env, id)
  if (!ok) return c.json({ error: "no duplicates" }, 400)
  const job = await loadJobDetail(c.env, currentUser(c).id, id)
  if (!job) return c.json({ error: "not found" }, 404)
  return c.json({ job })
})
