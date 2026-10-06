import speedrunProvider from "../vendor/career-ops/a16z-speedrun-talent.mjs"
import { fromCareerOps } from "./career-ops"

/** The feed searches server-side, so the page's ?q= is the source's query. */
export const a16zSpeedrun = fromCareerOps(speedrunProvider, {
  kind: "query",
  detect: (url) =>
    url.hostname === "speedrun-talent-network.com" ? url.searchParams.get("q")?.trim() || "*" : null,
  entry: (token) => ({
    name: "a16z speedrun",
    careers_url: "https://speedrun-talent-network.com",
    q: token === "*" ? undefined : token,
    max_pages: 3,
  }),
})
