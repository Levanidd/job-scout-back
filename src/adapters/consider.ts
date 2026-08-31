import considerProvider from "../vendor/career-ops/consider.mjs"
import { BROWSER_LIKE_USER_AGENT } from "../vendor/career-ops/_http.mjs"
import { fetchText } from "../http"
import { fromCareerOps, labelFromUrl } from "./career-ops"

/**
 * The board id is opaque — Founderful's is "wingman" — so it cannot be derived
 * from the URL. It is however printed in the board's own page, in the exact
 * shape the provider later posts it back.
 */
const BOARD_ID = /"board"\s*:\s*\{\s*"id"\s*:\s*"([a-z0-9_-]+)"/i

async function resolveBoardId(url: string): Promise<string> {
  // These boards answer 403 to a non-browser agent, which is why the provider
  // sends a browser one on its own calls.
  const html = await fetchText(url, { headers: { "User-Agent": BROWSER_LIKE_USER_AGENT } })
  const id = html.match(BOARD_ID)?.[1]
  if (!id) throw new Error(`consider: no board id in ${url}`)
  return id
}

/** VC talent networks hosted on getconsider.com (Creandum, Balderton, Founderful). */
export const consider = fromCareerOps(considerProvider, {
  kind: "query",
  detect: () => null,
  entry: async (token) => ({
    name: labelFromUrl(token),
    careers_url: token,
    provider: "consider",
    consider_board: await resolveBoardId(token),
  }),
})
