import ripplingProvider from "../vendor/career-ops/rippling.mjs"
import { fromCareerOps } from "./career-ops"

export const rippling = fromCareerOps(ripplingProvider, { kind: "company" })
