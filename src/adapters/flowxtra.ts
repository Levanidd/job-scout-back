import flowxtraProvider from "../vendor/career-ops/flowxtra.mjs"
import { fromCareerOps } from "./career-ops"

export const flowxtra = fromCareerOps(flowxtraProvider, {
  kind: "query",
  detect: (url) => (url.hostname.endsWith("flowxtra.com") ? url.searchParams.get("q") ?? "*" : null),
  entry: () => ({ name: "Flowxtra", provider: "flowxtra", max_pages: 3 }),
  filterLocally: true,
})
