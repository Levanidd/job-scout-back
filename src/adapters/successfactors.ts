import successfactorsProvider from "../vendor/career-ops/successfactors.mjs"
import { fromCareerOps } from "./career-ops"

export const successfactors = fromCareerOps(successfactorsProvider, { kind: "company" })
