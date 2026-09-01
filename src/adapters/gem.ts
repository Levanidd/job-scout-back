import gemProvider from "../vendor/career-ops/gem.mjs"
import { fromCareerOps } from "./career-ops"

export const gem = fromCareerOps(gemProvider, { kind: "company" })
