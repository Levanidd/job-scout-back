import deutschebahnProvider from "../vendor/career-ops/deutschebahn.mjs"
import { fromCareerOps } from "./career-ops"

/** One 1000-hit page already covers the board, so a single page is the whole walk. */
export const deutschebahn = fromCareerOps(deutschebahnProvider, {
  kind: "company",
  entry: (token) => ({ name: "Deutsche Bahn", careers_url: token, api: token, max_pages: 1 }),
})
