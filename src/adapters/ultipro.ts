import ultiproProvider from "../vendor/career-ops/ultipro.mjs"
import { fromCareerOps, labelFromUrl } from "./career-ops"

export const ultipro = fromCareerOps(ultiproProvider, {
  kind: "company",
  entry: (token) => ({
    name: labelFromUrl(token),
    careers_url: token,
    api: token,
    max_pages: 4,
  }),
})
