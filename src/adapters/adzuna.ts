import { asArray, asRecord, fetchJson, str } from "../http"
import { clipDescription } from "../prefilter"
import { toSalary } from "../salary"
import type { Adapter, AdapterEnv, RawJob } from "../types"

export function parseAdzuna(payload: unknown): RawJob[] {
  const root = asRecord(payload)
  const jobs: RawJob[] = []
  for (const item of asArray(root?.results)) {
    const row = asRecord(item)
    if (!row) continue
    const id = str(row.id)
    const title = str(row.title)
    const url = str(row.redirect_url) ?? str(row.adref)
    if (!id || !title || !url) continue
    const loc = asRecord(row.location)
    const company = asRecord(row.company)
    jobs.push({
      externalId: id,
      title,
      company: str(company?.display_name),
      location: str(loc?.display_name),
      url,
      description: clipDescription(str(row.description)),
      postedAt: str(row.created),
      salary: toSalary({ min: row.salary_min, max: row.salary_max, currency: "EUR" }),
    })
  }
  return jobs
}

export const adzuna: Adapter = {
  provider: "adzuna",
  kind: "query",
  detect(url) {
    if (url.hostname.endsWith("adzuna.com") || url.hostname.endsWith("adzuna.de")) {
      return url.search || "what=product%20manager&where=berlin"
    }
    return null
  },
  async fetchJobs(token, env?: AdapterEnv) {
    const appId = env?.ADZUNA_APP_ID
    const appKey = env?.ADZUNA_APP_KEY
    if (!appId || !appKey) {
      throw new Error("Adzuna is not configured (ADZUNA_APP_ID / ADZUNA_APP_KEY)")
    }
    const params = new URLSearchParams(token)
    params.set("app_id", appId)
    params.set("app_key", appKey)
    const json = await fetchJson(`https://api.adzuna.com/v1/api/jobs/de/search/1?${params.toString()}`)
    return parseAdzuna(json)
  },
}
