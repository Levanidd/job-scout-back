import { asArray, asRecord, fetchJson, str } from "../http"
import { clipDescription } from "../prefilter"
import type { Adapter, RawJob } from "../types"

export function parseArbeitnow(payload: unknown, filter?: string): RawJob[] {
  const root = asRecord(payload)
  const needle = filter?.trim().toLowerCase()
  const jobs: RawJob[] = []
  for (const item of asArray(root?.data)) {
    const row = asRecord(item)
    if (!row) continue
    const title = str(row.title)
    const slug = str(row.slug)
    const url = str(row.url)
    if (!title || (!slug && !url)) continue
    if (needle && needle !== "*" && !`${title} ${str(row.company_name) ?? ""}`.toLowerCase().includes(needle)) {
      continue
    }
    const created = row.created_at
    let postedAt: string | undefined
    if (typeof created === "number") postedAt = new Date(created * 1000).toISOString()
    jobs.push({
      externalId: slug ?? url ?? title,
      title,
      company: str(row.company_name),
      location: str(row.location),
      url: url ?? `https://www.arbeitnow.com/jobs/${slug}`,
      description: clipDescription(str(row.description)),
      postedAt,
    })
  }
  return jobs
}

export const arbeitnow: Adapter = {
  provider: "arbeitnow",
  kind: "query",
  detect(url) {
    if (url.hostname.endsWith("arbeitnow.com")) return url.searchParams.get("q") ?? "*"
    return null
  },
  async fetchJobs(token) {
    const all: RawJob[] = []
    for (let page = 1; page <= 5; page += 1) {
      const json = await fetchJson(`https://www.arbeitnow.com/api/job-board-api?page=${page}`)
      const batch = parseArbeitnow(json, token)
      all.push(...batch)
      const root = asRecord(json)
      const data = asArray(root?.data)
      if (data.length === 0) break
      if (data.length < 50) break
    }
    return all
  },
}
