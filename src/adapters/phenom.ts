import phenomProvider from "../vendor/career-ops/phenom.mjs"
import { fromCareerOps, labelFromUrl } from "./career-ops"

/** Default walk is 20 pages. A branded Phenom board is recognised only when added by hand. */
export const phenom = fromCareerOps(phenomProvider, {
  kind: "company",
  entry: (token) => ({
    name: labelFromUrl(token),
    careers_url: token,
    api: token,
    max_pages: 3,
  }),
})
