import generalistProvider from "../vendor/career-ops/generalist-world.mjs"
import { fromCareerOps } from "./career-ops"

export const generalistWorld = fromCareerOps(generalistProvider, {
  kind: "query",
  detect: (url) =>
    url.hostname === "generalist.world" || url.hostname === "www.generalist.world" ? "*" : null,
  entry: () => ({ name: "Generalist World", provider: "generalist-world" }),
})
