// The "Company: Role" title split and the URL hardening follow
// santifer/career-ops (providers/weworkremotely.mjs, MIT).

import { fetchText, str, toIso, trustedUrl } from "../http"
import { clipDescription } from "../prefilter"
import type { Adapter, RawJob } from "../types"
import { parser, textOf } from "./rss"

const HOST = "weworkremotely.com"
const FEED = `https://${HOST}/remote-jobs.rss`

/** Feed titles read "Acme: Senior Product Manager"; without the colon we only have a role. */
function splitTitle(raw: string): { company?: string; title: string } {
  const colon = raw.indexOf(":")
  if (colon > 0) {
    const company = raw.slice(0, colon).trim()
    const title = raw.slice(colon + 1).trim()
    if (company && title) return { company, title }
  }
  return { title: raw.trim() }
}

export function parseWeWorkRemotely(xml: string, filter?: string): RawJob[] {
  const doc = parser.parse(xml) as Record<string, unknown>
  const rss = doc.rss as Record<string, unknown> | undefined
  const channel = rss?.channel as Record<string, unknown> | undefined
  const raw = channel?.item
  const items = Array.isArray(raw) ? raw : raw ? [raw] : []
  const needle = filter?.trim().toLowerCase()
  const jobs: RawJob[] = []
  for (const item of items) {
    if (!item || typeof item !== "object") continue
    const row = item as Record<string, unknown>
    const rawTitle = textOf(row.title) ?? str(row.title)
    const url = trustedUrl(textOf(row.link) ?? str(row.link), HOST)
    if (!rawTitle || !url) continue
    const { company, title } = splitTitle(rawTitle)
    if (needle && needle !== "*" && !`${title} ${company ?? ""}`.toLowerCase().includes(needle)) {
      continue
    }
    jobs.push({
      externalId: url,
      title,
      company,
      location: textOf(row.region) ?? str(row.region) ?? textOf(row.category) ?? str(row.category),
      url,
      description: clipDescription(textOf(row.description) ?? str(row.description)),
      postedAt: toIso(textOf(row.pubDate) ?? str(row.pubDate)),
    })
  }
  return jobs
}

export const weworkremotely: Adapter = {
  provider: "weworkremotely",
  kind: "query",
  detect(url) {
    if (url.hostname.endsWith(HOST)) return url.searchParams.get("q") ?? "*"
    return null
  },
  async fetchJobs(token) {
    return parseWeWorkRemotely(await fetchText(FEED), token)
  },
}
