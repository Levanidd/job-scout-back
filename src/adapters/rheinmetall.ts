import rheinmetallProvider from "../vendor/career-ops/rheinmetall.mjs"
import { fromCareerOps } from "./career-ops"

/** Ten postings a page over a board of well over a thousand: only the newest slice fits a run. */
export const rheinmetall = fromCareerOps(rheinmetallProvider, {
  kind: "company",
  entry: (token) => ({ name: "Rheinmetall", careers_url: token, api: token, max_pages: 10 }),
})
