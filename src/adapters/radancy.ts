import radancyProvider from "../vendor/career-ops/radancy.mjs"
import { fromCareerOps, labelFromUrl } from "./career-ops"

/**
 * TalentBrew sites sit on the employer's own domain, so a bare URL says nothing
 * about the vendor: src/detect.ts recognises them by the Radancy CDN on the page.
 */
export const radancy = fromCareerOps(radancyProvider, {
  kind: "company",
  detect: () => null,
  entry: (token) => ({ name: labelFromUrl(token), careers_url: token, api: token, max_pages: 5 }),
})
