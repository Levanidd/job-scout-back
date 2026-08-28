import { asArray, asRecord, fetchJson, str } from "../http"
import { clipDescription } from "../prefilter"
import type { Adapter, RawJob } from "../types"

export function parseGreenhouse(payload: unknown, fallbackCompany?: string): RawJob[] {
  const root = asRecord(payload)
  const jobs: RawJob[] = []
  for (const item of asArray(root?.jobs)) {
    const row = asRecord(item)
    if (!row) continue
    const id = str(row.id)
    const title = str(row.title)
    const url = str(row.absolute_url)
    if (!id || !title || !url) continue
    const loc = asRecord(row.location)
    jobs.push({
      externalId: id,
      title,
      company: str(row.company_name) ?? fallbackCompany,
      location: str(loc?.name),
      url,
      description: clipDescription(str(row.content)),
      postedAt: str(row.updated_at) ?? str(row.first_published),
    })
  }
  return jobs
}

export const greenhouse: Adapter = {
  provider: "greenhouse",
  kind: "company",
  detect(url) {
    const host = url.hostname
    if (host === "boards.greenhouse.io" || host === "job-boards.greenhouse.io") {
      const token = url.pathname.split("/").filter(Boolean)[0]
      return token ?? null
    }
    return null
  },
  async fetchJobs(token) {
    const json = await fetchJson(`https://boards-api.greenhouse.io/v1/boards/${token}/jobs?content=true`)
    return parseGreenhouse(json, token)
  },
}
