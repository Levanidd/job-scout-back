import getonbrdProvider from "../vendor/career-ops/getonbrd.mjs"
import { fromCareerOps } from "./career-ops"

export const getonbrd = fromCareerOps(getonbrdProvider, {
  kind: "query",
  detect: (url) => (url.hostname.endsWith("getonbrd.com") ? url.searchParams.get("q") ?? "*" : null),
  entry: () => ({
    name: "Get on Board",
    provider: "getonbrd",
    max_pages: 2,
    categories: ["programming", "operations-management", "machine-learning-ai"],
  }),
  filterLocally: true,
})
