import { asArray, asRecord, fetchJson, str } from "../http"
import { clipDescription } from "../prefilter"
import type { Adapter, RawJob } from "../types"

const PAGE = 100
const MAX_PAGES = 5

const COUNTRY: Record<string, string> = {
  germany: "DEU",
  deutschland: "DEU",
  france: "FRA",
  netherlands: "NLD",
  poland: "POL",
  spain: "ESP",
  ireland: "IRL",
  austria: "AUT",
  switzerland: "CHE",
  italy: "ITA",
  sweden: "SWE",
  belgium: "BEL",
  luxembourg: "LUX",
  denmark: "DNK",
  czechia: "CZE",
  "czech-republic": "CZE",
  "united-kingdom": "GBR",
  uk: "GBR",
  "united-states": "USA",
  usa: "USA",
}

/** "Project/Program/Product Management--Non-Tech" is the slug the search API filters on. */
export function amazonCategorySlug(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
}

function titleCase(slug: string): string {
  return decodeURIComponent(slug)
    .replace(/-/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b[a-z]/g, (letter) => letter.toUpperCase())
}

function unique(values: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const value of values) {
    const key = value.toLowerCase()
    if (!value || seen.has(key)) continue
    seen.add(key)
    out.push(value)
  }
  return out
}

/**
 * The location page and the search page spell the same filters differently.
 * The token is the query string `search.json` actually accepts.
 */
export function amazonToken(url: URL): string | null {
  if (!url.hostname.endsWith("amazon.jobs")) return null
  const query = url.searchParams
  const path = url.pathname.match(/\/locations\/([^/]+)(?:\/([^/]+))?/i)
  const countrySlug = path?.[1]?.toLowerCase()
  const country =
    query.get("normalized_country_code[]") ??
    (query.get("country")?.length === 3 ? query.get("country")!.toUpperCase() : null) ??
    (countrySlug ? COUNTRY[countrySlug] : null)
  const cities = unique([
    ...query.getAll("normalized_city_name[]"),
    ...query.getAll("region[]"),
    ...query.getAll("city"),
    ...(path?.[2] ? [titleCase(path[2])] : []),
  ])
  const categories = unique(
    [...query.getAll("category[]"), ...query.getAll("job_category[]")].map(amazonCategorySlug),
  )
  if (cities.length === 0 && categories.length === 0) return null
  const params = new URLSearchParams()
  if (country) params.append("normalized_country_code[]", country)
  for (const city of cities) params.append("normalized_city_name[]", city)
  for (const category of categories) params.append("category[]", category)
  return params.toString()
}

function postedAt(value: unknown): string | undefined {
  const raw = str(value)
  if (!raw) return undefined
  // "September 2, 2026" has no timezone. Noon UTC keeps the calendar day stable.
  const named = raw.match(/^([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})/)
  const parsed = Date.parse(named ? `${named[1]} ${named[2]}, ${named[3]} 12:00:00 UTC` : raw)
  if (Number.isNaN(parsed)) return undefined
  return new Date(parsed).toISOString()
}

function body(row: Record<string, unknown>): string | undefined {
  const parts = [str(row.description), str(row.basic_qualifications), str(row.preferred_qualifications)].filter(
    (part): part is string => Boolean(part),
  )
  return parts.length > 0 ? parts.join("\n\n") : undefined
}

export function parseAmazon(payload: unknown): RawJob[] {
  const root = asRecord(payload)
  const jobs: RawJob[] = []
  for (const item of asArray(root?.jobs)) {
    const row = asRecord(item)
    if (!row) continue
    const id = str(row.id_icims) ?? str(row.id)
    const title = str(row.title)
    const path = str(row.job_path)
    if (!id || !title || !path) continue
    jobs.push({
      externalId: id,
      title,
      company: str(row.company_name) ?? "Amazon",
      location: str(row.normalized_location) ?? str(row.location),
      url: path.startsWith("http") ? path : `https://www.amazon.jobs${path}`,
      description: clipDescription(body(row)),
      postedAt: postedAt(row.posted_date),
    })
  }
  return jobs
}

export const amazon: Adapter = {
  provider: "amazon",
  kind: "query",
  detect(url) {
    return amazonToken(url)
  },
  async fetchJobs(token) {
    const all: RawJob[] = []
    for (let page = 0; page < MAX_PAGES; page += 1) {
      const params = new URLSearchParams(token)
      params.set("offset", String(page * PAGE))
      params.set("result_limit", String(PAGE))
      const json = await fetchJson(`https://www.amazon.jobs/en/search.json?${params}`)
      const batch = parseAmazon(json)
      all.push(...batch)
      const hits = Number(asRecord(json)?.hits ?? 0)
      if (batch.length < PAGE) break
      if (hits > 0 && (page + 1) * PAGE >= hits) break
    }
    return all
  },
}
