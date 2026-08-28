import { asArray, asRecord, fetchJson, str } from "../http"
import { clipDescription } from "../prefilter"
import type { Adapter, RawJob } from "../types"

export function parseLever(payload: unknown, fallbackCompany?: string): RawJob[] {
  const jobs: RawJob[] = []
  for (const item of asArray(payload)) {
    const row = asRecord(item)
    if (!row) continue
    const id = str(row.id)
    const title = str(row.text)
    const url = str(row.hostedUrl) ?? str(row.applyUrl)
    if (!id || !title || !url) continue
    const categories = asRecord(row.categories)
    const created = row.createdAt
    jobs.push({
      externalId: id,
      title,
      company: fallbackCompany,
      location: str(categories?.location),
      url,
      description: clipDescription(str(row.descriptionPlain) ?? str(row.description)),
      postedAt: typeof created === "number" ? new Date(created).toISOString() : str(created),
    })
  }
  return jobs
}

export const lever: Adapter = {
  provider: "lever",
  kind: "company",
  detect(url) {
    if (url.hostname === "jobs.lever.co") {
      return url.pathname.split("/").filter(Boolean)[0] ?? null
    }
    return null
  },
  async fetchJobs(token) {
    const json = await fetchJson(`https://api.lever.co/v0/postings/${token}?mode=json`)
    return parseLever(json, token)
  },
}
