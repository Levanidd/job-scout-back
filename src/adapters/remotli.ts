import remotliProvider from "../vendor/career-ops/remotli.mjs"
import { fromCareerOps } from "./career-ops"

export const remotli = fromCareerOps(remotliProvider, {
  kind: "query",
  detect: (url) => (url.hostname.endsWith("remotli.ch") ? url.searchParams.get("q") ?? "*" : null),
  entry: () => ({
    name: "Remotli",
    provider: "remotli",
    careers_url: "https://remotli.ch/",
    max_pages: 8,
  }),
  filterLocally: true,
})
