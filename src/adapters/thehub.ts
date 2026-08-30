// Field mapping, the pagination stop conditions and the partial-failure
// tolerance follow santifer/career-ops (providers/thehub.mjs, MIT).

import { asArray, asRecord, fetchJson, str } from "../http"
import type { Adapter, RawJob } from "../types"

const HOST = "thehub.io"
const PER_PAGE = 15
const MAX_PAGES = 12

/** Without a country the API scopes results to the caller's geo-IP. */
const COUNTRY = "EU"

export function parseTheHub(payload: unknown, filter?: string): RawJob[] {
  const root = asRecord(payload)
  const needle = filter?.trim().toLowerCase()
  const jobs: RawJob[] = []
  for (const bucket of [asRecord(root?.jobs), asRecord(root?.featuredJobs)]) {
    for (const item of asArray(bucket?.docs)) {
      const row = asRecord(item)
      if (!row) continue
      const id = str(row.id)
      const title = str(row.title)
      if (!id || !title) continue
      const company = str(asRecord(row.company)?.name)
      if (needle && needle !== "*" && !`${title} ${company ?? ""}`.toLowerCase().includes(needle)) {
        continue
      }
      const place = asRecord(row.location)
      const base =
        str(place?.address) ?? [str(place?.locality), str(place?.country)].filter(Boolean).join(", ")
      jobs.push({
        externalId: id,
        title,
        company,
        // Remote is an extra fact about a located role, not a replacement for it.
        location: [base, row.isRemote === true ? "Remote" : ""].filter(Boolean).join(", ") || undefined,
        // The host is ours, so the URL is never attacker-controlled.
        url: `https://${HOST}/jobs/${encodeURIComponent(id)}`,
        // The v2 payload carries neither a description nor a publication date.
      })
    }
  }
  return jobs
}

export const thehub: Adapter = {
  provider: "thehub",
  kind: "query",
  detect(url) {
    if (url.hostname.endsWith(HOST)) return url.searchParams.get("q") ?? "*"
    return null
  },
  async fetchJobs(token) {
    const byId = new Map<string, RawJob>()
    for (let page = 1; page <= MAX_PAGES; page += 1) {
      let root: Record<string, unknown> | null
      try {
        const json = await fetchJson(
          `https://${HOST}/api/v2/jobsandfeatured?countryCode=${COUNTRY}&page=${page}`,
        )
        root = asRecord(asRecord(json)?.jobs)
        if (!root || !Array.isArray(root.docs)) throw new Error("expected { jobs: { docs: [...] } }")
        for (const job of parseTheHub(json, token)) {
          // Featured postings repeat on every page.
          if (!byId.has(job.externalId)) byId.set(job.externalId, job)
        }
      } catch (error) {
        // Losing page 7 should not throw away pages 1-6.
        if (page === 1) throw error
        break
      }
      if (root.docs.length < PER_PAGE) break
      const pages = root.pages
      if (typeof pages === "number" && page >= pages) break
    }
    return [...byId.values()]
  },
}
