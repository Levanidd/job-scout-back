// The vendored providers are plain ESM with JSDoc types, so give TypeScript
// the shape their default export is contractually guaranteed to have.
declare module "*.mjs" {
  const provider: import("../../adapters/career-ops").CareerOpsProvider
  export default provider
  /** Only `_http.mjs` exports this; the wildcard cannot say so. */
  export const BROWSER_LIKE_USER_AGENT: string
  /** `avature.mjs`. Epoch milliseconds when the posting date was on the card. */
  export function parseArticles(
    html: string,
    origin: string,
  ): Array<{ id: string; title: string; url: string; location: string; postedAt?: number }>
  /** `beesite.mjs`. */
  export function buildSearchUrl(
    cfg: { searchApi: string; languageCode: string; searchCriteria: unknown[] },
    firstItem: number,
  ): string
  export function parseSearchResult(json: unknown): {
    total: number | null
    rows: Array<{ id: string; title: string; url: string; location: string; postedAt?: number }>
  }
}
