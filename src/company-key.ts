const SUFFIX = /\b(gmbh|se|ag|ltd|inc|b\.v\.|bv|llc|plc|kg|ohg|ug)\b/gi

export function companyKey(name: string): string {
  return name
    .toLowerCase()
    .replace(SUFFIX, " ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
}

/** German and Dutch postings tag the title with a gender marker that varies by board. */
const GENDER_TAG = /\(\s*[mwfdxhv](\s*[/|]\s*[mwfdxhv])+\s*\)|\b[mwf]\s*\/\s*[wf]\s*\/\s*[dx]\b/gi

/**
 * Identifies one opening across the boards that carry it. A role reaches us
 * from the employer's own board and from every aggregator that scraped it, and
 * those copies share nothing reliable — not the URL, not the id — except who
 * is hiring and for what.
 */
export function dedupKey(company: string, title: string): string {
  const role = title
    .toLowerCase()
    .replace(GENDER_TAG, " ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
  const who = companyKey(company)
  return who && role ? `${who}|${role}` : ""
}

export async function jobHash(provider: string, token: string, externalId: string): Promise<string> {
  const bytes = new TextEncoder().encode(`${provider}:${token}:${externalId}`)
  const digest = await crypto.subtle.digest("SHA-256", bytes)
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("")
}
