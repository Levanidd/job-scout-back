import jobviteProvider from "../vendor/career-ops/jobvite.mjs"
import { fromCareerOps } from "./career-ops"

export const jobvite = fromCareerOps(jobviteProvider, { kind: "company" })
