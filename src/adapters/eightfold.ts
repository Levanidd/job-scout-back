import eightfoldProvider from "../vendor/career-ops/eightfold.mjs"
import { fromCareerOps, labelFromUrl } from "./career-ops"

/** Default upstream walk is 200 pages; a Worker cannot spend that on one board. */
export const eightfold = fromCareerOps(eightfoldProvider, {
  kind: "company",
  entry: (token) => ({
    name: labelFromUrl(token),
    careers_url: token,
    max_pages: 8,
  }),
})
