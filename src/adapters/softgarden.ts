import softgardenProvider from "../vendor/career-ops/softgarden.mjs"
import { fromCareerOps } from "./career-ops"

export const softgarden = fromCareerOps(softgardenProvider, { kind: "company" })
