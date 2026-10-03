import taleoProvider from "../vendor/career-ops/taleo.mjs"
import { fromCareerOps, labelFromUrl } from "./career-ops"

export const taleo = fromCareerOps(taleoProvider, {
  kind: "company",
  entry: (token) => ({
    name: labelFromUrl(token),
    careers_url: token,
    api: token,
    max_pages: 3,
  }),
})
