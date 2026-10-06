import adpProvider from "../vendor/career-ops/adp-workforcenow.mjs"
import { fromCareerOps, labelFromUrl } from "./career-ops"

export const adpWorkforcenow = fromCareerOps(adpProvider, {
  kind: "company",
  entry: (token) => ({ name: labelFromUrl(token), careers_url: token, api: token, max_pages: 5 }),
})
