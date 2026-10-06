import hecklerkochProvider from "../vendor/career-ops/hecklerkoch.mjs"
import { fromCareerOps } from "./career-ops"

export const hecklerkoch = fromCareerOps(hecklerkochProvider, {
  kind: "company",
  entry: (token) => ({ name: "Heckler & Koch", careers_url: token, api: token }),
})
