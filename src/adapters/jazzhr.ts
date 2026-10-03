import jazzhrProvider from "../vendor/career-ops/jazzhr.mjs"
import { fromCareerOps } from "./career-ops"

export const jazzhr = fromCareerOps(jazzhrProvider, { kind: "company" })
