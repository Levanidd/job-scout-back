import { asArray, asRecord, fetchJson, str } from "../http"
import { clipDescription } from "../prefilter"
import type { Adapter, RawJob } from "../types"

export function parseAshby(payload: unknown, fallbackCompany?: string): RawJob[] {
  const root = asRecord(payload)
  const jobs: RawJob[] = []
  for (const item of asArray(root?.jobs)) {
    const row = asRecord(item)
    if (!row) continue
    const id = str(row.id)
    const title = str(row.title)
    const url = str(row.jobUrl) ?? str(row.applyUrl)
    if (!id || !title || !url) continue
    const location = str(row.location) ?? (row.isRemote === true ? "Remote" : undefined)
    jobs.push({
      externalId: id,
      title,
      company: fallbackCompany,
      location,
      url,
      description: clipDescription(str(row.descriptionHtml) ?? str(row.descriptionPlain)),
      postedAt: str(row.publishedAt),
    })
  }
  return jobs
}

export const ashby: Adapter = {
  provider: "ashby",
  kind: "company",
  detect(url) {
    if (url.hostname === "jobs.ashbyhq.com") {
      return url.pathname.split("/").filter(Boolean)[0] ?? null
    }
    return null
  },
  async fetchJobs(token) {
    const json = await fetchJson(
      `https://api.ashbyhq.com/posting-api/job-board/${token}?includeCompensation=true`,
    )
    return parseAshby(json, token)
  },
}
