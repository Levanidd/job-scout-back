import { asRecord, fetchJson, str } from "../http"
import { clipDescription } from "../prefilter"
import { BROWSER_LIKE_USER_AGENT } from "../vendor/career-ops/_http.mjs"
import workdayProvider from "../vendor/career-ops/workday.mjs"
import { fromCareerOps, labelFromUrl } from "./career-ops"

/**
 * The listing call only carries title and location. The posting body is a
 * second request: `GET /wday/cxs/{tenant}/{site}/job/...`.
 */
const WORKDAY_JOB =
  /^https:\/\/([\w-]+)\.(wd[\w-]*)\.myworkdayjobs\.com\/(?:[a-z]{2}-[A-Z]{2}\/)?([^/?#]+)(\/job\/[^?#]*)/i

export function workdayDetailUrl(jobUrl: string): string | null {
  const match = jobUrl.match(WORKDAY_JOB)
  if (!match) return null
  const [, tenant, instance, site, path] = match
  return `https://${tenant}.${instance}.myworkdayjobs.com/wday/cxs/${tenant}/${site}${path}`
}

export function readWorkdayDescription(payload: unknown): string | undefined {
  const info = asRecord(asRecord(payload)?.jobPostingInfo)
  return clipDescription(str(info?.jobDescription))
}

export async function fetchWorkdayDescription(jobUrl: string): Promise<string | null> {
  const detail = workdayDetailUrl(jobUrl)
  if (!detail) return null
  const origin = new URL(detail).origin
  try {
    const payload = await fetchJson(detail, {
      headers: {
        accept: "application/json",
        "accept-language": "en-US,en;q=0.9",
        "user-agent": BROWSER_LIKE_USER_AGENT,
        origin,
        referer: `${origin}/`,
      },
    })
    return readWorkdayDescription(payload) ?? null
  } catch {
    return null
  }
}

export const workday = fromCareerOps(workdayProvider, {
  kind: "company",
  entry: (token) => ({
    name: labelFromUrl(token),
    careers_url: token,
    api: token,
    provider: "workday",
    // One page is one subrequest, and a Worker gets few of those. Upstream
    // allows 100, which NVIDIA's 2000-posting tenant spends in full; ten pages
    // covers every employer that is not a giant.
    max_pages: 10,
  }),
})
