import { asArray, asRecord, fetchJson, str } from "../http"
import type { Adapter, RawJob } from "../types"

const BASE = "https://rest.arbeitsagentur.de/jobboerse/jobsuche-service/pc/v6/jobs"
const KEY = "jobboerse-jobsuche"

type Offer = {
  referenznummer?: string
  stellenangebotsTitel?: string
  hauptberuf?: string
  firma?: string
  datumErsteVeroeffentlichung?: string
  stellenlokationen?: unknown
}

export function parseArbeitsagentur(payload: unknown): RawJob[] {
  const root = asRecord(payload)
  const offers = asArray(root?.ergebnisliste)
  const jobs: RawJob[] = []
  for (const item of offers) {
    const row = asRecord(item)
    if (!row) continue
    const offer = row as Offer
    const id = str(offer.referenznummer)
    if (!id) continue
    const title = str(offer.stellenangebotsTitel) ?? str(offer.hauptberuf) ?? "Untitled"
    const place = asRecord(asRecord(asArray(offer.stellenlokationen)[0])?.adresse)
    jobs.push({
      externalId: id,
      title,
      company: str(offer.firma),
      location: str(place?.ort),
      url: `https://www.arbeitsagentur.de/jobsuche/jobdetail/${encodeURIComponent(id)}`,
      postedAt: str(offer.datumErsteVeroeffentlichung),
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
