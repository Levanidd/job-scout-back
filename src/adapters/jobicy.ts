// Field mapping and the URL/date hardening follow santifer/career-ops
// (providers/jobicy.mjs, MIT).

import { asArray, asRecord, fetchJson, str, toIso, trustedUrl } from "../http"
import { clipDescription } from "../prefilter"
import type { Adapter, RawJob } from "../types"

const HOST = "jobicy.com"
const COUNT = 50

export function parseJobicy(payload: unknown, filter?: string): RawJob[] {
  const root = asRecord(payload)
  const needle = filter?.trim().toLowerCase()
  const jobs: RawJob[] = []
  for (const item of asArray(root?.jobs)) {
    const row = asRecord(item)
    if (!row) continue
    const title = str(row.jobTitle)
    const url = trustedUrl(row.url, HOST)
    if (!title || !url) continue
    const company = str(row.companyName)
    if (needle && needle !== "*" && !`${title} ${company ?? ""}`.toLowerCase().includes(needle)) {
      continue
    }
    jobs.push({
      externalId: str(row.id) ?? url,
      title,
      company,
      location: str(row.jobGeo) ?? "Remote",
      url,
      description: clipDescription(str(row.jobDescription)),
      postedAt: toIso(row.pubDate),
    })
  }
  return jobs
}

export const jobicy: Adapter = {
  provider: "jobicy",
  kind: "query",
  detect(url) {
    if (url.hostname.endsWith(HOST)) return url.searchParams.get("q") ?? "*"
    return null
  },
  async fetchJobs(token) {
    // The feed returns newest-first across every industry, so a bare read rarely
    // surfaces a niche role. `tag` narrows it server-side before the 50-row cut.
    const needle = token.trim()
    const searchable = Boolean(needle) && needle !== "*"
    const tag = searchable ? `&tag=${encodeURIComponent(needle)}` : ""
    const json = await fetchJson(`https://${HOST}/api/v2/remote-jobs?count=${COUNT}${tag}`)
    const root = asRecord(json)
    if (!root || !Array.isArray(root.jobs)) {
      throw new Error("jobicy: expected { jobs: [...] }")
    }
    // Re-filtering a server-side search would drop its near-matches, e.g. a
    // "Product Owner" answering a "product manager" tag.
    return parseJobicy(json, searchable ? undefined : token)
  },
}
