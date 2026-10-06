import { fetchResponse } from "../http"
import getroProvider from "../vendor/career-ops/getro.mjs"
import { BROWSER_LIKE_USER_AGENT } from "../vendor/career-ops/_http.mjs"
import { fromCareerOps, labelFromUrl } from "./career-ops"

/**
 * The provider refuses to follow redirects, so a board that tidies its own URL
 * (jobs.pointnine.com sends you to /companies) fails before it starts. Landing
 * on the board's real page is fine; leaving its host is what the refusal is
 * there to prevent, so that is what we check instead.
 */
async function resolveBoardUrl(raw: string): Promise<string> {
  const start = new URL(raw)
  try {
    const res = await fetchResponse(raw, {
      headers: { Accept: "text/html", "User-Agent": BROWSER_LIKE_USER_AGENT },
    })
    const final = new URL(res.url || raw)
    return final.hostname === start.hostname ? final.href : raw
  } catch {
    return raw
  }
}

/**
 * Portfolio job boards run by VC funds (Atomico, Cherry Ventures, Point Nine,
 * HV Capital). Every tenant sits on the fund's own domain, so nothing in the
 * URL says "Getro" — detection happens on the page, in src/detect.ts, and the
 * provider resolves its collection id from the board's own markup.
 */
/**
 * A board link may carry `?q=product+manager`, which Getro then searches
 * server-side. It matches descriptions too, so a single word like "product"
 * barely narrows a board, while a phrase cuts it to the roles that matter.
 */
export function getroBoard(token: string): { board: string; query: string } {
  try {
    const url = new URL(token)
    const query = url.searchParams.get("q")?.trim() ?? ""
    url.searchParams.delete("q")
    return { board: url.href, query }
  } catch {
    return { board: token, query: "" }
  }
}

export const getro = fromCareerOps(getroProvider, {
  kind: "query",
  detect: () => null,
  entry: async (token) => {
    const { board, query } = getroBoard(token)
    return {
      name: labelFromUrl(board),
      careers_url: await resolveBoardUrl(board),
      provider: "getro",
      getro_query: query,
      // A page is one subrequest and a Worker gets few of those; upstream's forty
      // walks a fund's whole back catalogue when we only ever want what's new.
      getro_max_pages: 15,
    }
  },
})
