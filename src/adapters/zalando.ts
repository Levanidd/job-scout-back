import { asArray, asRecord, fetchText, str } from "../http"
import { clipDescription } from "../prefilter"
import type { Adapter, RawJob } from "../types"

/**
 * Zalando runs its own career site, a Next.js app over an internal search API
 * that is not reachable from outside. Each page carries its data in the React
 * flight stream instead: the list page holds fifteen postings, a posting page
 * holds the full text. Postings are fetched list-only; the body is pulled
 * later, only for jobs that reach the model (see `fetchZalandoDescription`).
 */
const ORIGIN = "https://jobs.zalando.com"
const MAX_PAGES = 30

const ZALANDO_JOB = /^https:\/\/jobs\.zalando\.com\/[a-z]{2}\/jobs\/(\d+)/i

/** Next.js streams page data as `self.__next_f.push([1,"…"])` string chunks. */
export function readFlight(html: string): string {
  let out = ""
  for (const match of html.matchAll(/self\.__next_f\.push\(\[1,("(?:[^"\\]|\\.)*")\]\)/g)) {
    try {
      out += JSON.parse(match[1]!) as string
    } catch {
      /* a chunk that is not a plain string carries no data we read */
    }
  }
  return out
}

/** Parses the JSON object or array that opens at `start`; braces inside strings don't count. */
function jsonAt(text: string, start: number): unknown {
  let depth = 0
  let inString = false
  let escaped = false
  for (let i = start; i < text.length; i++) {
    const char = text[i]
    if (inString) {
      if (escaped) escaped = false
      else if (char === "\\") escaped = true
      else if (char === '"') inString = false
      continue
    }
    if (char === '"') inString = true
    else if (char === "{" || char === "[") depth++
    else if (char === "}" || char === "]") {
      depth--
      if (depth === 0) {
        try {
          return JSON.parse(text.slice(start, i + 1))
        } catch {
          return null
        }
      }
    }
  }
  return null
}

/**
 * Long strings are not inlined: the field holds `$31`, and the text is a
 * separate row `31:T<byte length in hex>,<text>`.
 */
function flightText(flight: string, value: string): string | undefined {
  if (!value.startsWith("$")) return value
  const ref = value.slice(1)
  const header = new RegExp(`(?<![0-9a-f])${ref}:T([0-9a-f]+),`).exec(flight)
  if (!header) return undefined
  const bytes = new TextEncoder().encode(flight.slice(header.index + header[0].length))
  return new TextDecoder().decode(bytes.slice(0, parseInt(header[1]!, 16)))
}

export function parseZalandoPage(html: string): { jobs: RawJob[]; total: number } {
  const flight = readFlight(html)
  const at = flight.indexOf('{"data":[')
  const root = at >= 0 ? asRecord(jsonAt(flight, at)) : null
  const jobs: RawJob[] = []
  for (const item of asArray(root?.data)) {
    const row = asRecord(item)
    const id = str(row?.id)
    const title = str(row?.title)
    if (!row || !id || !title) continue
    const offices = asArray(row.offices).map(str).filter(Boolean)
    jobs.push({
      externalId: id,
      title,
      company: "Zalando",
      location: offices.length ? offices.join(", ") : undefined,
      url: `${ORIGIN}/en/jobs/${id}`,
      postedAt: str(row.updated_at),
    })
  }
  return { jobs, total: Number(root?.total) || 0 }
}

export function zalandoDetailUrl(jobUrl: string): string | null {
  const match = jobUrl.match(ZALANDO_JOB)
  return match ? `${ORIGIN}/en/jobs/${match[1]}` : null
}

export function readZalandoDescription(html: string): string | undefined {
  const flight = readFlight(html)
  // The posting mirrors its Workday record; `content` is the same text, but
  // the name is common enough on the page to only trust it as a reference.
  const field =
    /"Job_Description":("(?:[^"\\]|\\.)*")/.exec(flight) ?? /"content":("\$[0-9a-f]+")/.exec(flight)
  if (!field) return undefined
  const value = JSON.parse(field[1]!) as string
  return clipDescription(flightText(flight, value))
}

export async function fetchZalandoDescription(jobUrl: string): Promise<string | null> {
  const detail = zalandoDetailUrl(jobUrl)
  if (!detail) return null
  try {
    return readZalandoDescription(await fetchText(detail)) ?? null
  } catch {
    return null
  }
}

export const zalando: Adapter = {
  provider: "zalando",
  kind: "company",
  detect(url) {
    return url.hostname === "jobs.zalando.com" ? "zalando" : null
  },
  async fetchJobs() {
    const jobs: RawJob[] = []
    for (let page = 1; page <= MAX_PAGES; page++) {
      const { jobs: found, total } = parseZalandoPage(await fetchText(`${ORIGIN}/en/jobs?page=${page}`))
      jobs.push(...found)
      if (found.length === 0 || jobs.length >= total) break
    }
    return jobs
  },
}
