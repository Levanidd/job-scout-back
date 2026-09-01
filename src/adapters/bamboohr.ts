import bamboohrProvider from "../vendor/career-ops/bamboohr.mjs"
import { fromCareerOps } from "./career-ops"

export const bamboohr = fromCareerOps(bamboohrProvider, { kind: "company" })
