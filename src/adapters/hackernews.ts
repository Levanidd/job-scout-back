import hackernewsProvider from "../vendor/career-ops/hackernews.mjs"
import { fromCareerOps } from "./career-ops"

/** The monthly thread is one fetch; ?q= narrows it locally (e.g. "berlin"). */
export const hackernews = fromCareerOps(hackernewsProvider, {
  kind: "query",
  detect: (url) =>
    url.hostname === "news.ycombinator.com" ? url.searchParams.get("q")?.trim() || "*" : null,
  entry: () => ({ name: "Hacker News" }),
  filterLocally: true,
})
