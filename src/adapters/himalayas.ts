// Field mapping and the URL/date hardening follow santifer/career-ops
// (providers/himalayas.mjs, MIT).

import { asArray, asRecord, fetchJson, str, toIso, trustedUrl } from "../http"
import { clipDescription } from "../prefilter"
import type { Adapter, RawJob } from "../types"

const HOST = "himalayas.app"

/** The board carries ~95k postings, so we only ever walk the newest few pages. */
const MAX_PAGES = 15

/** The server pins pages to 20 whatever we ask for; `limit` is a hint, not a contract. */
const PAGE_SIZE = 20

export function parseHimalayas(payload: unknown, filter?: string): RawJob[] {
  const root = asRecord(payload)
  const needle = filter?.trim().toLowerCase()
  const jobs: RawJob[] = []
  for (const item of asArray(root?.jobs)) {
    const row = asRecord(item)
    if (!row) continue
    const title = str(row.title)
    const url = trustedUrl(row.applicationLink, HOST) ?? trustedUrl(row.guid, HOST)
    if (!title || !url) continue
    const company = str(row.companyName)
    if (needle && needle !== "*" && !`${title} ${company ?? ""}`.toLowerCase().includes(needle)) {
      continue
    }
    jobs.push({
      externalId: url,
      title,
      company,
      // locationRestrictions is the only geo signal; an empty one means worldwide.
      location: asArray(row.locationRestrictions).map(String).join(", ") || "Remote",
      url,
      description: clipDescription(str(row.description)),
      postedAt: toIso(row.pubDate),
    })
  }
  return jobs
}

export const himalayas: Adapter = {
  provider: "himalayas",
  kind: "query",
  detect(url) {
    if (url.hostname.endsWith(HOST)) return url.searchParams.get("q") ?? "*"
    return null
  },
  async fetchJobs(token) {
    const all: RawJob[] = []
    let cursor: string | undefined
    for (let page = 0; page < MAX_PAGES; page += 1) {
      const query = cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""
      const json = await fetchJson(`https://${HOST}/jobs/api?limit=${PAGE_SIZE}${query}`)
      const root = asRecord(json)
      // A shape change should read as a broken source, not an empty board.
      if (!root || !Array.isArray(root.jobs)) {
        if (page > 0) break
        throw new Error("himalayas: expected { jobs: [...] }")
      }
      all.push(...parseHimalayas(json, token))
      // The cursor is the only trustworthy end-of-feed signal: page size is the
      // server's to decide, so a short page does not mean the last one.
      if (root.jobs.length === 0) break
      cursor = str(root.nextCursor)
      if (!cursor) break
    }
    return all
  },
}
