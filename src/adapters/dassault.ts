import dassaultProvider from "../vendor/career-ops/dassault.mjs"
import { fromCareerOps } from "./career-ops"

export const dassault = fromCareerOps(dassaultProvider, {
  kind: "company",
  entry: (token) => ({ name: "Dassault Systèmes", careers_url: token, api: token }),
})
