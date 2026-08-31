import wttjProvider from "../vendor/career-ops/wttj.mjs"
import { fromCareerOps } from "./career-ops"

/**
 * Welcome to the Jungle is a global board searched through Algolia, so unlike
 * the feed-style boards it has nothing to hand back without a query.
 */
export const wttj = fromCareerOps(wttjProvider, {
  kind: "query",
  detect: (url) =>
    url.hostname.endsWith("welcometothejungle.com") ? url.searchParams.get("q") ?? "*" : null,
  entry: (token) => {
    if (!token.trim() || token === "*") {
      throw new Error("wttj: the board is global — add a search to the URL, e.g. ?q=product manager")
    }
    return { name: "Welcome to the Jungle", provider: "wttj", wttj: { queries: [token] } }
  },
  // The search already narrowed it; re-filtering would drop its near-matches.
})
