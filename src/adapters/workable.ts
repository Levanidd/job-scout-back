import { asArray, asRecord, fetchJson, str } from "../http"
import { clipDescription } from "../prefilter"
import type { Adapter, RawJob } from "../types"

export function parseWorkable(payload: unknown, fallbackCompany?: string): RawJob[] {
  const root = asRecord(payload)
  const company = str(root?.name) ?? fallbackCompany
  const jobs: RawJob[] = []
  for (const item of asArray(root?.jobs)) {
    const row = asRecord(item)
    if (!row) continue
    const title = str(row.title)
    const shortcode = str(row.shortcode) ?? str(row.id)
    const url = str(row.application_url) ?? str(row.url)
    if (!title || !shortcode || !url) continue
    const loc = asRecord(row.location)
    const location = [str(loc?.city), str(loc?.country)].filter(Boolean).join(", ")
    jobs.push({
      externalId: shortcode,
      title,
      company,
      location: location || undefined,
      url,
      description: clipDescription(str(row.description)),
      postedAt: str(row.created_at),
    })
  }
  return jobs
}

export const workable: Adapter = {
  provider: "workable",
  kind: "company",
  detect(url) {
    if (url.hostname === "apply.workable.com") {
      return url.pathname.split("/").filter(Boolean)[0] ?? null
    }
    return null
  },
  async fetchJobs(token) {
    const json = await fetchJson(`https://apply.workable.com/api/v1/widget/accounts/${token}?details=true`)
    return parseWorkable(json, token)
  },
}
