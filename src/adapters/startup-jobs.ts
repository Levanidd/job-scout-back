import startupJobsProvider from "../vendor/career-ops/startup-jobs.mjs"
import { fromCareerOps } from "./career-ops"

/**
 * The feed is only the newest ~50 postings, so a source is one role page
 * (startup.jobs/roles/product-manager, optionally /remote) rather than the
 * whole board.
 */
export function startupJobsToken(url: URL): string | null {
  if (url.hostname !== "startup.jobs" && url.hostname !== "www.startup.jobs") return null
  const m = url.pathname.match(/^\/roles\/([a-z0-9-]+)(\/remote)?\/?$/)
  if (!m) return "*"
  const params = new URLSearchParams({ role: m[1] })
  if (m[2]) params.set("workplace", "remote")
  return params.toString()
}

export const startupJobs = fromCareerOps(startupJobsProvider, {
  kind: "query",
  detect: startupJobsToken,
  entry: (token) => {
    const params = new URLSearchParams(token === "*" ? "" : token)
    return {
      name: "Startup Jobs",
      provider: "startup-jobs",
      startup_jobs: {
        role: params.get("role") ?? undefined,
        workplace: params.get("workplace") ?? undefined,
      },
    }
  },
})
