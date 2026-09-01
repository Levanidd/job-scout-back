import fourDayWeekProvider from "../vendor/career-ops/4dayweek.mjs"
import { fromCareerOps } from "./career-ops"

export const fourdayweek = fromCareerOps(fourDayWeekProvider, {
  kind: "query",
  detect: (url) => (url.hostname.endsWith("4dayweek.io") ? url.searchParams.get("q") ?? "*" : null),
  entry: () => ({ name: "4 Day Week", provider: "4dayweek", max_pages: 5 }),
  filterLocally: true,
})
