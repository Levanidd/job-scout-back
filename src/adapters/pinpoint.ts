import pinpointProvider from "../vendor/career-ops/pinpoint.mjs"
import { fromCareerOps } from "./career-ops"

export const pinpoint = fromCareerOps(pinpointProvider, { kind: "company" })
