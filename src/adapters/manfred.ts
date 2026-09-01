import manfredProvider from "../vendor/career-ops/manfred.mjs"
import { fromCareerOps } from "./career-ops"

export const manfred = fromCareerOps(manfredProvider, {
  kind: "query",
  detect: (url) => (url.hostname.endsWith("getmanfred.com") ? url.searchParams.get("q") ?? "*" : null),
  entry: () => ({ name: "getManfred", provider: "manfred", lang: "EN" }),
  filterLocally: true,
})
