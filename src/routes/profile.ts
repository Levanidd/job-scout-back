import { Hono } from "hono"

import { message } from "../errors"
import { prefilterAndScore, reapplyPrefilter } from "../ingest"
import { isThinkingLevel, listModels, validateModel, type ThinkingLevel } from "../scoring"
import {
  SETTING_MODEL,
  SETTING_THINKING,
  listOpenCompanies,
  resolveCompanyBlacklist,
  resolvePrefilter,
  settingsView,
  writeCompanyBlacklist,
  writePrefilter,
  writeSetting,
} from "../settings"
import type { Bindings } from "../types"

export const profile = new Hono<{ Bindings: Bindings }>()

profile.get("/api/profile", async (c) => {
  const row = await c.env.DB.prepare(`SELECT content FROM profile WHERE id = 1`).first<{ content: string }>()
  const [prefilter, blacklist, companies] = await Promise.all([
    resolvePrefilter(c.env),
    resolveCompanyBlacklist(c.env),
    listOpenCompanies(c.env),
  ])
  return c.json({ content: row?.content ?? "", prefilter, blacklist, companies })
})

profile.put("/api/profile", async (c) => {
  const body = await c.req.json<{
    content?: string
    prefilter?: { keep?: unknown; drop?: unknown }
    blacklist?: unknown
  }>()
  if (typeof body.content !== "string" && !body.prefilter && !Array.isArray(body.blacklist)) {
    return c.json({ error: "content, prefilter or blacklist required" }, 400)
  }

  if (typeof body.content === "string") {
    await c.env.DB.prepare(
      `INSERT INTO profile (id, content) VALUES (1, ?) ON CONFLICT(id) DO UPDATE SET content = excluded.content`,
    )
      .bind(body.content)
      .run()
  }

  let prefilter = await resolvePrefilter(c.env)
  let applied: { dropped: number; restored: number } | undefined
  if (body.prefilter) {
    prefilter = await writePrefilter(c.env, {
      keep: Array.isArray(body.prefilter.keep) ? body.prefilter.keep.map(String) : prefilter.keep,
      drop: Array.isArray(body.prefilter.drop) ? body.prefilter.drop.map(String) : prefilter.drop,
    })
    applied = await reapplyPrefilter(c.env)
  }

  const blacklist = Array.isArray(body.blacklist)
    ? await writeCompanyBlacklist(c.env, body.blacklist)
    : await resolveCompanyBlacklist(c.env)

  return c.json({ ok: true, prefilter, applied, blacklist })
})

profile.post("/api/profile/rescore", async (c) => {
  await c.env.DB.prepare(
    `UPDATE jobs SET score = NULL, score_reason = NULL, flags = NULL
     WHERE closed_at IS NULL AND status NOT IN ('ignored', 'rejected', 'off_profile')`,
  ).run()
  const { scored } = await prefilterAndScore(c.env)
  return c.json({ ok: true, scored })
})

profile.get("/api/settings", async (c) => c.json(await settingsView(c.env)))

profile.get("/api/models", async (c) => {
  if (!c.env.GEMINI_API_KEY) return c.json({ models: [], error: "GEMINI_API_KEY is not configured" })
  try {
    return c.json({ models: await listModels(c.env.GEMINI_API_KEY) })
  } catch (error) {
    return c.json({ models: [], error: message(error) }, 502)
  }
})

profile.put("/api/settings", async (c) => {
  const body = await c.req.json<{ model?: string; thinking_level?: string }>()
  const model = body.model?.trim()
  const thinking = body.thinking_level?.trim()

  if (thinking && !isThinkingLevel(thinking)) return c.json({ error: "bad thinking_level" }, 400)
  if (!model && !thinking) return c.json({ error: "nothing to update" }, 400)

  if (model) {
    if (!c.env.GEMINI_API_KEY) return c.json({ error: "GEMINI_API_KEY is not configured" }, 400)
    const level: ThinkingLevel = isThinkingLevel(thinking ?? "")
      ? (thinking as ThinkingLevel)
      : (await settingsView(c.env)).thinking_level
    try {
      // A model that cannot actually be called should fail here, not on the next run.
      await validateModel(c.env.GEMINI_API_KEY, model, level)
    } catch (error) {
      return c.json({ error: message(error) }, 400)
    }
    await writeSetting(c.env, SETTING_MODEL, model)
  }
  if (thinking) await writeSetting(c.env, SETTING_THINKING, thinking)

  return c.json(await settingsView(c.env))
})
