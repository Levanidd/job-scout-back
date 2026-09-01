import nodeskProvider from "../vendor/career-ops/nodesk.mjs"
import { fromCareerOps } from "./career-ops"

export const nodesk = fromCareerOps(nodeskProvider, {
  kind: "query",
  detect: (url) => (url.hostname.endsWith("nodesk.co") ? url.searchParams.get("q") ?? "*" : null),
  entry: () => ({ name: "NoDesk" }),
  filterLocally: true,
})
