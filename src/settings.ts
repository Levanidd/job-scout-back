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
