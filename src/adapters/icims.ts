import icimsProvider from "../vendor/career-ops/icims.mjs"
import { fromCareerOps } from "./career-ops"

export const icims = fromCareerOps(icimsProvider, { kind: "company" })
