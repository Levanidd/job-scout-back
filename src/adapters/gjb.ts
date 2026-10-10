import { buildSearchUrl, parseSearchResult } from "../vendor/career-ops/beesite.mjs"
import { fetchJson, fetchText, toIso } from "../http"
import type { Adapter, RawJob } from "../types"

/** The search call serves 100 rows. Ten pages is the same cap the beesite walker uses. */
const PAGE_SIZE = 100
const MAX_PAGES = 10

/**
 * Milch & Zucker Global Jobboard on a company host. The public JSON API is the
 * same shape beesite uses, but it is not served from `*.beesite.de`: the
 * careers page points at it from `gjb_scripts.js`.
 */
export const gjb: Adapter = {
  provider: "gjb",
  kind: "company",
  async fetchJobs(token) {
    const origin = new URL(token)
    if (origin.protocol !== "https:") throw new Error(`gjb: URL must use HTTPS: ${token}`)
    const script = await fetchText(new URL("/script/gjb_scripts.js", origin.origin).href)
    const address = script.match(/gjbAddress\s*=\s*"(https:\/\/[^"]+)"/)
    if (!address) throw new Error(`gjb: no API address on ${origin.origin}`)
    const searchApi = new URL("search", address[1]).href.replace(/\/$/, "")

    const jobs: RawJob[] = []
    const seen = new Set<string>()
    let total: number | null = null
    for (let page = 0; page < MAX_PAGES; page++) {
      const json = await fetchJson(
        buildSearchUrl({ searchApi, languageCode: "DE", searchCriteria: [] }, page * PAGE_SIZE + 1),
      )
      const parsed = parseSearchResult(json)
      if (total === null) total = parsed.total
      if (parsed.rows.length === 0) break
      for (const row of parsed.rows) {
        if (seen.has(row.id)) continue
        seen.add(row.id)
        jobs.push({
          externalId: row.id,
          title: row.title,
          location: row.location || undefined,
          url: row.url,
          postedAt: toIso(row.postedAt),
        })
      }
      if ((total !== null && jobs.length >= total) || parsed.rows.length < PAGE_SIZE) break
    }
    return jobs
  },
}
