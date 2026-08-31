import landingjobsProvider from "../vendor/career-ops/landingjobs.mjs"
import { fromCareerOps } from "./career-ops"

/** Tech roles across Europe; the feed is board-wide, so the token filters it. */
export const landingjobs = fromCareerOps(landingjobsProvider, {
  kind: "query",
  detect: (url) => (url.hostname.endsWith("landing.jobs") ? url.searchParams.get("q") ?? "*" : null),
  entry: () => ({ name: "Landing.jobs" }),
  filterLocally: true,
})
