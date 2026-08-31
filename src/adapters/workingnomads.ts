import workingnomadsProvider from "../vendor/career-ops/workingnomads.mjs"
import { fromCareerOps } from "./career-ops"

export const workingnomads = fromCareerOps(workingnomadsProvider, {
  kind: "query",
  detect: (url) =>
    url.hostname.endsWith("workingnomads.com") ? url.searchParams.get("q") ?? "*" : null,
  entry: () => ({ name: "Working Nomads" }),
  filterLocally: true,
})
