import csodProvider from "../vendor/career-ops/csod.mjs"
import { fromCareerOps, labelFromUrl } from "./career-ops"

export const csod = fromCareerOps(csodProvider, {
  kind: "company",
  entry: (token) => ({ name: labelFromUrl(token), careers_url: token, api: token, max_pages: 4 }),
})
