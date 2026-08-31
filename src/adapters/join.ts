import joinProvider from "../vendor/career-ops/join.mjs"
import { fromCareerOps } from "./career-ops"

/** Common with DACH startups; the board is a Next.js page with the jobs inlined. */
export const join = fromCareerOps(joinProvider, { kind: "company" })
