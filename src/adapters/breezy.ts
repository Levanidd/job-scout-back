import breezyProvider from "../vendor/career-ops/breezy.mjs"
import { fromCareerOps } from "./career-ops"

export const breezy = fromCareerOps(breezyProvider, { kind: "company" })
