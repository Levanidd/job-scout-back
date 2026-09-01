import nofluffjobsProvider from "../vendor/career-ops/nofluffjobs.mjs"
import { fromCareerOps } from "./career-ops"

export const nofluffjobs = fromCareerOps(nofluffjobsProvider, {
  kind: "query",
  detect: (url) => (url.hostname.endsWith("nofluffjobs.com") ? url.searchParams.get("q") ?? "*" : null),
  entry: () => ({
    name: "NoFluffJobs",
    careers_url: "https://nofluffjobs.com",
    max_pages: 5,
  }),
  filterLocally: true,
})
