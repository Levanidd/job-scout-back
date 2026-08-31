// The vendored providers are plain ESM with JSDoc types, so give TypeScript
// the shape their default export is contractually guaranteed to have.
declare module "*.mjs" {
  const provider: import("../../adapters/career-ops").CareerOpsProvider
  export default provider
  /** Only `_http.mjs` exports this; the wildcard cannot say so. */
  export const BROWSER_LIKE_USER_AGENT: string
}
