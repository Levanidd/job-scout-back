import remotiveProvider from "../vendor/career-ops/remotive.mjs"
import { fromCareerOps } from "./career-ops"

export const remotive = fromCareerOps(remotiveProvider, {
  kind: "query",
  detect: (url) => (url.hostname.endsWith("remotive.com") ? url.searchParams.get("q") ?? "*" : null),
  entry: () => ({ name: "Remotive" }),
  filterLocally: true,
})
