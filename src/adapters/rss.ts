import { XMLParser } from "fast-xml-parser"

import { fetchText, str } from "../http"
import { clipDescription } from "../prefilter"
import type { Adapter, RawJob } from "../types"

export const parser = new XMLParser({ ignoreAttributes: false, cdataPropName: "__cdata" })

export function textOf(value: unknown): string | undefined {
  if (typeof value === "string") return value
  if (value && typeof value === "object") {
    const rec = value as Record<string, unknown>
    if (typeof rec["#text"] === "string") return rec["#text"]
    if (typeof rec.__cdata === "string") return rec.__cdata
  }
  return undefined
}

export function parseRss(xml: string): RawJob[] {
  const doc = parser.parse(xml) as Record<string, unknown>
  const rss = doc.rss as Record<string, unknown> | undefined
  const feed = (rss?.channel ?? doc.feed) as Record<string, unknown> | undefined
  if (!feed) return []
  const raw = feed.item ?? feed.entry
  const items = Array.isArray(raw) ? raw : raw ? [raw] : []
  const jobs: RawJob[] = []
  for (const item of items) {
    if (!item || typeof item !== "object") continue
    const row = item as Record<string, unknown>
    const title = textOf(row.title) ?? str(row.title)
    const url = textOf(row.link) ?? str(row.link) ?? textOf(row.guid)
    if (!title || !url) continue
    jobs.push({
      externalId: url,
      title,
      url,
      description: clipDescription(textOf(row.description) ?? str(row.description)),
      postedAt: textOf(row.pubDate) ?? str(row.pubDate),
    })
  }
  return jobs
}

export const rss: Adapter = {
  provider: "rss",
  kind: "company",
  detect(url) {
    if (/\.(rss|xml|atom)$/i.test(url.pathname) || /rss|atom|feed/i.test(url.pathname)) {
      return url.href
    }
    return null
  },
  async fetchJobs(token) {
    const xml = await fetchText(token)
    return parseRss(xml)
  },
}
