import {
  DEFAULT_PREFILTER,
  collapseSpaces,
  sanitizeTags,
  type PrefilterRules,
} from "./prefilter"
import {
  DEFAULT_MODEL,
  DEFAULT_THINKING_LEVEL,
  isThinkingLevel,
  type ScoringConfig,
  type ThinkingLevel,
} from "./scoring"
import type { Bindings } from "./types"

export const SETTING_MODEL = "gemini_model"
export const SETTING_THINKING = "gemini_thinking_level"
export const SETTING_PREFILTER_KEEP = "prefilter_keep"
export const SETTING_PREFILTER_DROP = "prefilter_drop"
export const SETTING_COMPANY_BLACKLIST = "company_blacklist"

export type BlacklistedCompany = { company_key: string; company: string }

async function read(env: Bindings, key: string): Promise<string | null> {
  const row = await env.DB.prepare(`SELECT value FROM settings WHERE key = ?`).bind(key).first<{ value: string }>()
  return row?.value ?? null
}

export async function writeSetting(env: Bindings, key: string, value: string): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, datetime('now'))
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
  )
    .bind(key, value)
    .run()
}

function parseTagSetting(raw: string | null, fallback: string[]): string[] {
  if (!raw) return fallback
  try {
    const parsed: unknown = JSON.parse(raw)
    const tags = sanitizeTags(parsed)
    return tags.length > 0 || Array.isArray(parsed) ? tags : fallback
  } catch {
    return fallback
  }
}

export async function resolvePrefilter(env: Bindings): Promise<PrefilterRules> {
  const [keepRaw, dropRaw] = await Promise.all([
    read(env, SETTING_PREFILTER_KEEP),
    read(env, SETTING_PREFILTER_DROP),
  ])
  return {
    keep: parseTagSetting(keepRaw, DEFAULT_PREFILTER.keep),
    drop: parseTagSetting(dropRaw, DEFAULT_PREFILTER.drop),
  }
}

export async function resolveUserPrefilter(env: Bindings, userId: number): Promise<PrefilterRules> {
  const row = await env.DB.prepare(`SELECT prefilter_keep, prefilter_drop FROM user_profiles WHERE user_id = ?`)
    .bind(userId)
    .first<{ prefilter_keep: string; prefilter_drop: string }>()
  if (!row) return { keep: [...DEFAULT_PREFILTER.keep], drop: [...DEFAULT_PREFILTER.drop] }
  return {
    keep: parseTagSetting(row.prefilter_keep, DEFAULT_PREFILTER.keep),
    drop: parseTagSetting(row.prefilter_drop, DEFAULT_PREFILTER.drop),
  }
}

export async function resolveUserBlacklist(env: Bindings, userId: number): Promise<BlacklistedCompany[]> {
  const row = await env.DB.prepare(`SELECT blacklist FROM user_profiles WHERE user_id = ?`)
    .bind(userId)
    .first<{ blacklist: string }>()
  if (!row?.blacklist) return []
  try {
    return sanitizeCompanyBlacklist(JSON.parse(row.blacklist) as unknown)
  } catch {
    return []
  }
}

export async function blockedCompanyKeysForUser(env: Bindings, userId: number): Promise<Set<string>> {
  return blacklistKeys(await resolveUserBlacklist(env, userId))
}

export async function excludeBlockedCompaniesForUser(
  env: Bindings,
  userId: number,
  column: string,
): Promise<{ sql: string; binds: string[] }> {
  const list = await resolveUserBlacklist(env, userId)
  return sqlExcludeCompanyKeys(
    column,
    list.map((item) => item.company_key),
  )
}

export async function writePrefilter(env: Bindings, rules: PrefilterRules): Promise<PrefilterRules> {
  const keep = sanitizeTags(rules.keep)
  const drop = sanitizeTags(rules.drop)
  await Promise.all([
    writeSetting(env, SETTING_PREFILTER_KEEP, JSON.stringify(keep)),
    writeSetting(env, SETTING_PREFILTER_DROP, JSON.stringify(drop)),
  ])
  return { keep, drop }
}

export function sanitizeCompanyBlacklist(input: unknown): BlacklistedCompany[] {
  if (!Array.isArray(input)) return []
  const seen = new Set<string>()
  const out: BlacklistedCompany[] = []
  for (const item of input) {
    if (!item || typeof item !== "object") continue
    const company_key = collapseSpaces(String((item as { company_key?: unknown }).company_key ?? "")).toLowerCase()
    const company = collapseSpaces(String((item as { company?: unknown }).company ?? ""))
    if (!company_key || !company) continue
    if (seen.has(company_key)) continue
    seen.add(company_key)
    out.push({ company_key, company })
    if (out.length >= 80) break
  }
  return out
}

export async function resolveCompanyBlacklist(env: Bindings): Promise<BlacklistedCompany[]> {
  const raw = await read(env, SETTING_COMPANY_BLACKLIST)
  if (!raw) return []
  try {
    return sanitizeCompanyBlacklist(JSON.parse(raw) as unknown)
  } catch {
    return []
  }
}

export async function writeCompanyBlacklist(env: Bindings, items: unknown): Promise<BlacklistedCompany[]> {
  const list = sanitizeCompanyBlacklist(items)
  await writeSetting(env, SETTING_COMPANY_BLACKLIST, JSON.stringify(list))
  return list
}

export function blacklistKeys(list: BlacklistedCompany[]): Set<string> {
  return new Set(list.map((item) => item.company_key))
}

/** The blocked companies as a lookup, for filtering rows already in memory. */
export async function blockedCompanyKeys(env: Bindings): Promise<Set<string>> {
  return blacklistKeys(await resolveCompanyBlacklist(env))
}

/**
 * A WHERE fragment that hides blocked companies. Keys are stored folded by
 * `companyKey`, so the column is compared as-is and the index stays usable.
 */
export function sqlExcludeCompanyKeys(column: string, keys: string[]): { sql: string; binds: string[] } {
  if (keys.length === 0) return { sql: "1=1", binds: [] }
  return {
    sql: `${column} NOT IN (${keys.map(() => "?").join(", ")})`,
    binds: keys,
  }
}

/** The same exclusion, resolved against the stored blacklist in one step. */
export async function excludeBlockedCompanies(
  env: Bindings,
  column: string,
): Promise<{ sql: string; binds: string[] }> {
  const list = await resolveCompanyBlacklist(env)
  return sqlExcludeCompanyKeys(
    column,
    list.map((item) => item.company_key),
  )
}

export async function listOpenCompanies(env: Bindings): Promise<BlacklistedCompany[]> {
  const rows = await env.DB.prepare(
    `SELECT company_key, MIN(company) AS company
     FROM jobs
     WHERE closed_at IS NULL AND company_key IS NOT NULL AND company_key != ''
     GROUP BY company_key
     ORDER BY company COLLATE NOCASE`,
  ).all<BlacklistedCompany>()
  return rows.results
}

/** DB wins over the GEMINI_MODEL secret so the model stays changeable from the admin. */
export async function resolveScoringConfig(env: Bindings): Promise<ScoringConfig> {
  const [model, thinking] = await Promise.all([read(env, SETTING_MODEL), read(env, SETTING_THINKING)])
  return {
    apiKey: env.GEMINI_API_KEY,
    model: model ?? env.GEMINI_MODEL ?? DEFAULT_MODEL,
    thinkingLevel: thinking && isThinkingLevel(thinking) ? thinking : DEFAULT_THINKING_LEVEL,
  }
}

export type SettingsView = {
  model: string
  thinking_level: ThinkingLevel
  source: "database" | "secret" | "default"
  key_configured: boolean
}

export async function settingsView(env: Bindings): Promise<SettingsView> {
  const [stored, thinking] = await Promise.all([read(env, SETTING_MODEL), read(env, SETTING_THINKING)])
  return {
    model: stored ?? env.GEMINI_MODEL ?? DEFAULT_MODEL,
    thinking_level: thinking && isThinkingLevel(thinking) ? thinking : DEFAULT_THINKING_LEVEL,
    source: stored ? "database" : env.GEMINI_MODEL ? "secret" : "default",
    key_configured: Boolean(env.GEMINI_API_KEY),
  }
}
