import comeetProvider from "../vendor/career-ops/comeet.mjs"
import { fromCareerOps } from "./career-ops"

/** Only the careers-api URL carries the tenant token, so that is what has to be pasted. */
export const comeet = fromCareerOps(comeetProvider, { kind: "company" })
