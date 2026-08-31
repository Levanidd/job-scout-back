import workdayProvider from "../vendor/career-ops/workday.mjs"
import { fromCareerOps, labelFromUrl } from "./career-ops"

export const workday = fromCareerOps(workdayProvider, {
  kind: "company",
  entry: (token) => ({
    name: labelFromUrl(token),
    careers_url: token,
    api: token,
    provider: "workday",
    // One page is one subrequest, and a Worker gets few of those. Upstream
    // allows 100, which NVIDIA's 2000-posting tenant spends in full; ten pages
    // covers every employer that is not a giant.
    max_pages: 10,
  }),
})
