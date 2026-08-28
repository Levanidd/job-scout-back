import { asArray, asRecord, fetchJson, str } from "../http"
import type { Adapter, RawJob } from "../types"

const BASE = "https://rest.arbeitsagentur.de/jobboerse/jobsuche-service/pc/v4/jobs"
const KEY = "jobboerse-jobsuche"

type Offer = {
  refnr?: string
  beruf?: string
  titel?: string
  arbeitgeber?: string
  aktuelleVeroeffentlichungsdatum?: string
  arbeitsort?: { ort?: string }
}

export function parseArbeitsagentur(payload: unknown): RawJob[] {
  const root = asRecord(payload)
  const offers = asArray(root?.stellenangebote)
  const jobs: RawJob[] = []
  for (const item of offers) {
    const row = asRecord(item)
    if (!row) continue
    const offer = row as Offer
    const id = str(offer.refnr)
    if (!id) continue
    const title = str(offer.titel) ?? str(offer.beruf) ?? "Untitled"
    const loc = asRecord(offer.arbeitsort)
    jobs.push({
      externalId: id,
      title,
      company: str(offer.arbeitgeber),
      location: str(loc?.ort),
      url: `https://www.arbeitsagentur.de/jobsuche/jobdetail/${encodeURIComponent(id)}`,
      postedAt: str(offer.aktuelleVeroeffentlichungsdatum),
    })
  }
  return jobs
}

export const arbeitsagentur: Adapter = {
  provider: "arbeitsagentur",
  kind: "query",
  detect(url) {
    if (url.hostname.endsWith("arbeitsagentur.de")) return url.search || url.href
    return null
  },
  async fetchJobs(token) {
    const all: RawJob[] = []
    for (let page = 1; page <= 5; page += 1) {
      const params = new URLSearchParams(token)
      params.set("page", String(page))
      if (!params.has("size")) params.set("size", "100")
      const json = await fetchJson(`${BASE}?${params.toString()}`, {
        headers: { "X-API-Key": KEY, Accept: "application/json" },
      })
      const batch = parseArbeitsagentur(json)
      all.push(...batch)
      if (batch.length < 100) break
    }
    return all
  },
}
