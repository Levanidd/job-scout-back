import teamtailorProvider from "../vendor/career-ops/teamtailor.mjs"
import { fromCareerOps } from "./career-ops"

export const teamtailor = fromCareerOps(teamtailorProvider, { kind: "company" })
