import remoteokProvider from "../vendor/career-ops/remoteok.mjs"
import { fromCareerOps } from "./career-ops"

export const remoteok = fromCareerOps(remoteokProvider, {
  kind: "query",
  detect: (url) => (url.hostname.endsWith("remoteok.com") ? url.searchParams.get("q") ?? "*" : null),
  entry: () => ({ name: "RemoteOK" }),
  filterLocally: true,
})
