import beesiteProvider from "../vendor/career-ops/beesite.mjs"
import { fromCareerOps, labelFromUrl } from "./career-ops"

/** Mercedes-class boards are huge; five pages of 100 is enough to see what's new. */
export const beesite = fromCareerOps(beesiteProvider, {
  kind: "company",
  entry: (token) => ({
    name: labelFromUrl(token),
    careers_url: token,
    api: token,
    max_pages: 5,
  }),
})
