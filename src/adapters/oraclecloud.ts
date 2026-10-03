import oraclecloudProvider from "../vendor/career-ops/oraclecloud.mjs"
import { fromCareerOps, labelFromUrl } from "./career-ops"

/**
 * JPMC alone lists thousands of postings. Two pages is the newest slice one
 * hop can fetch; the provider walks the rest only if max_pages is raised.
 */
export const oraclecloud = fromCareerOps(oraclecloudProvider, {
  kind: "company",
  entry: (token) => ({
    name: labelFromUrl(token),
    careers_url: token,
    api: token,
    max_pages: 2,
  }),
})
