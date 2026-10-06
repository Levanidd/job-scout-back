import avatureProvider from "../vendor/career-ops/avature.mjs"
import { fromCareerOps, labelFromUrl } from "./career-ops"

export const avature = fromCareerOps(avatureProvider, {
  kind: "company",
  entry: (token) => ({ name: labelFromUrl(token), careers_url: token, api: token, max_pages: 5 }),
})
