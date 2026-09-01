import justjoinProvider from "../vendor/career-ops/justjoin.mjs"
import { fromCareerOps } from "./career-ops"

export const justjoin = fromCareerOps(justjoinProvider, {
  kind: "query",
  detect: (url) => (url.hostname === "justjoin.it" ? url.searchParams.get("q") ?? "*" : null),
  entry: () => ({
    name: "JustJoin.it",
    careers_url: "https://justjoin.it/job-offers",
    api: "https://justjoin.it/api/candidate-api/offers",
    max_pages: 4,
  }),
  filterLocally: true,
})
