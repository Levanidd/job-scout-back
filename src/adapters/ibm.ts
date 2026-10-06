import ibmProvider from "../vendor/career-ops/ibm.mjs"
import { fromCareerOps } from "./career-ops"

/**
 * ibm.com/careers/search keeps its facets in the query string as
 * field_keyword_05[n] (country) and field_keyword_08[n] (category), the same
 * fields the provider filters on, so a search URL is copied over as is.
 */
export function ibmFilters(token: string): { country?: string; categories: string[] } {
  let params: URLSearchParams
  try {
    params = new URL(token).searchParams
  } catch {
    params = new URLSearchParams(token)
  }
  let country: string | undefined
  const categories: string[] = []
  for (const [key, value] of params) {
    if (key.startsWith("field_keyword_05")) country ??= value
    if (key.startsWith("field_keyword_08")) categories.push(value)
  }
  return { country: country ?? "Germany", categories }
}

export const ibm = fromCareerOps(ibmProvider, {
  kind: "company",
  detect: (url) =>
    /(^|\.)ibm\.com$/.test(url.hostname) && url.pathname.startsWith("/careers") ? url.href : null,
  entry: (token) => ({ name: "IBM", ibm: ibmFilters(token) }),
})
