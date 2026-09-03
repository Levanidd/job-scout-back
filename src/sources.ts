import { detectUrl } from "./detect"
import type { Bindings } from "./types"

export type TrackResult = { added: boolean; ats: string | null }

/**
 * Turns a company we only know by one posting into a source of its own. Both
 * Discovery and Explore end here, so a company added from either screen lands
 * in the watchlist the same way and disappears from the suggestions.
 */
export async function trackCompany(
  env: Bindings,
  key: string,
  company: string,
  url: string | null,
): Promise<TrackResult> {
  const detected = url ? await detectUrl(url, env) : null
  if (detected?.ats && detected.token && detected.ok) {
    await env.DB.prepare(
      `INSERT INTO sources (kind, tier, label, provider, token, careers_url, bootstrapped)
       VALUES ('company', 'watchlist', ?, ?, ?, ?, 0)
       ON CONFLICT(provider, token) DO UPDATE SET
         deleted_at = NULL, enabled = 1, label = excluded.label, created_at = datetime('now')`,
    )
      .bind(company, detected.ats, detected.token, url)
      .run()
    await markDiscovered(env, key, detected.ats)
    return { added: true, ats: detected.ats }
  }
  await markDiscovered(env, key, null)
  return { added: false, ats: null }
}

/** Off the suggestion list either way: a company we could not detect is still a decision made. */
async function markDiscovered(env: Bindings, key: string, ats: string | null): Promise<void> {
  await env.DB.prepare(
    `UPDATE discovered_companies SET state = 'added', detected_ats = COALESCE(?, detected_ats)
     WHERE company_key = ?`,
  )
    .bind(ats, key)
    .run()
}
