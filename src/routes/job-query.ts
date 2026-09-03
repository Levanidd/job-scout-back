import type { Context } from "hono"

import { excludeBlockedCompanies } from "../settings"
import type { Bindings } from "../types"

export type Ctx = Context<{ Bindings: Bindings }>

/** Descriptions run to kilobytes each and no list ever shows them. */
export const JOB_COLUMNS = `j.id, j.source_id, j.company, j.company_key, j.title, j.location, j.url,
  j.posted_at, j.first_seen_at, j.last_seen_at, j.changed_at, j.salary_min, j.salary_max, j.salary_currency,
  j.score, j.score_reason, j.flags, j.status, j.applied_at, j.viewed_at`

/** A posting is only ever shown with the source that carries it. */
export const JOB_SOURCE = `FROM jobs j JOIN sources s ON s.id = j.source_id`

export type Where = { clauses: string; binds: (string | number)[] }

const JOB_ORDER: Record<string, string> = {
  applied: `(j.applied_at IS NOT NULL)`,
  viewed: `(j.viewed_at IS NOT NULL)`,
  title: "j.title COLLATE NOCASE",
  company: "j.company COLLATE NOCASE",
  score: "j.score",
  posted: "COALESCE(j.posted_at, j.first_seen_at)",
  updated: "COALESCE(j.changed_at, j.first_seen_at)",
  added: "j.first_seen_at",
}

export function jobOrder(c: Ctx): string {
  const expr = JOB_ORDER[c.req.query("sort") ?? ""] ?? JOB_ORDER.score
  const dir = c.req.query("dir") === "asc" ? "ASC" : "DESC"
  return `${expr} ${dir} NULLS LAST, j.first_seen_at DESC`
}

export async function jobFilters(c: Ctx, withCompanies: boolean): Promise<Where> {
  const clauses = ["j.closed_at IS NULL"]
  const binds: (string | number)[] = []
  const blocked = await excludeBlockedCompanies(c.env, "j.company_key")
  clauses.push(blocked.sql)
  binds.push(...blocked.binds)

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

  const sourceId = Number(c.req.query("source_id") ?? 0)
  if (sourceId) {
    clauses.push("j.source_id = ?")
    binds.push(sourceId)
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

  const viewed = c.req.query("viewed")
  if (viewed === "yes") clauses.push("j.viewed_at IS NOT NULL")
  if (viewed === "no") clauses.push("j.viewed_at IS NULL")

  return { clauses: clauses.join(" AND "), binds }
}

/** The applied list is its own view: pipeline status instead of the list filters. */
export async function appliedFilters(c: Ctx): Promise<Where> {
  const clauses = ["j.applied_at IS NOT NULL"]
  const binds: (string | number)[] = []
  const blocked = await excludeBlockedCompanies(c.env, "j.company_key")
  clauses.push(blocked.sql)
  binds.push(...blocked.binds)

  const status = c.req.query("status") ?? ""
  if (status === "applied" || status === "interview" || status === "rejected") {
    clauses.push("j.status = ?")
    binds.push(status)
  }
  return { clauses: clauses.join(" AND "), binds }
}
