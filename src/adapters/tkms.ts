import tkmsProvider from "../vendor/career-ops/tkms.mjs"
import { fromCareerOps } from "./career-ops"

export const tkms = fromCareerOps(tkmsProvider, {
  kind: "company",
  entry: (token) => ({ name: "TKMS", careers_url: token, api: token, max_pages: 10 }),
})
