import joinupProvider from "../vendor/career-ops/joinup.mjs"
import { fromCareerOps } from "./career-ops"

export const joinup = fromCareerOps(joinupProvider, {
  kind: "query",
  detect: (url) => (url.hostname.endsWith("joinup.ch") ? url.searchParams.get("q") ?? "*" : null),
  entry: () => ({ name: "joinup.ch", careers_url: "https://joinup.ch/browse/jobs" }),
  filterLocally: true,
})
