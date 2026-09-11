import { DEFAULT_PREFILTER, sanitizeTags } from "./prefilter"
import {
  SETTING_COMPANY_BLACKLIST,
  SETTING_PREFILTER_DROP,
  SETTING_PREFILTER_KEEP,
  sanitizeCompanyBlacklist,
  type BlacklistedCompany,
} from "./settings"
import type { AuthUser, Bindings, UserRole } from "./types"

export type { AuthUser, UserRole }

export type UserProfileView = {
  content: string
  prefilter: { keep: string[]; drop: string[] }
  blacklist: BlacklistedCompany[]
}

const encoder = new TextEncoder()

export async function hashToken(token: string): Promise<string> {
  const bytes = await crypto.subtle.digest("SHA-256", encoder.encode(token))
  return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, "0")).join("")
}

export function randomToken(): string {
  const bytes = new Uint8Array(24)
  crypto.getRandomValues(bytes)
  let raw = ""
  for (const byte of bytes) raw += String.fromCharCode(byte)
  return btoa(raw).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "")
}

export function sanitizeUserName(raw: string): string | null {
  const name = raw.trim().replace(/\s+/g, " ")
  if (name.length < 1 || name.length > 40) return null
  return name
}

async function readSetting(env: Bindings, key: string): Promise<string | null> {
  const row = await env.DB.prepare(`SELECT value FROM settings WHERE key = ?`).bind(key).first<{ value: string }>()
  return row?.value ?? null
}

export async function findUserByToken(env: Bindings, token: string): Promise<AuthUser | null> {
  if (!token) return null
  const row = await env.DB.prepare(`SELECT id, name, role FROM users WHERE token_hash = ?`)
    .bind(await hashToken(token))
    .first<AuthUser>()
  return row ?? null
}

async function insertMaster(env: Bindings, name: string, tokenHash: string): Promise<number> {
  const inserted = await env.DB.prepare(`INSERT INTO users (name, role, token_hash) VALUES (?, 'master', ?)`)
    .bind(name, tokenHash)
    .run()
  const id = Number(inserted.meta.last_row_id)
  const content =
    (await env.DB.prepare(`SELECT content FROM profile WHERE id = 1`).first<{ content: string }>())?.content ?? ""
  const keep = (await readSetting(env, SETTING_PREFILTER_KEEP)) ?? JSON.stringify(DEFAULT_PREFILTER.keep)
  const drop = (await readSetting(env, SETTING_PREFILTER_DROP)) ?? JSON.stringify(DEFAULT_PREFILTER.drop)
  const blacklist = (await readSetting(env, SETTING_COMPANY_BLACKLIST)) ?? "[]"
  await env.DB.prepare(
    `INSERT INTO user_profiles (user_id, content, prefilter_keep, prefilter_drop, blacklist)
     VALUES (?, ?, ?, ?, ?)`,
  )
    .bind(id, content, keep, drop, blacklist)
    .run()
  await env.DB.prepare(
    `INSERT INTO user_jobs (
       user_id, job_id, status, score, score_reason, flags, notes,
       applied_at, viewed_at, later_at, notified_at
     )
     SELECT ?, id, status, score, score_reason, flags, notes,
            applied_at, viewed_at, later_at, notified_at
     FROM jobs`,
  )
    .bind(id)
    .run()
  return id
}

/**
 * First login with ADMIN_TOKEN, before anyone exists, becomes the master and
 * inherits the single-user profile / scores / statuses already in the tables.
 */
export async function bootstrapMaster(env: Bindings, token: string): Promise<AuthUser> {
  const existing = await findUserByToken(env, token)
  if (existing) return existing
  const count = await env.DB.prepare(`SELECT COUNT(*) AS n FROM users`).first<{ n: number }>()
  if (Number(count?.n) > 0) throw new Error("unauthorized")
  try {
    const id = await insertMaster(env, "Мастер", await hashToken(token))
    return { id, name: "Мастер", role: "master" }
  } catch {
    const raced = await findUserByToken(env, token)
    if (raced) return raced
    throw new Error("unauthorized")
  }
}

export async function resolveAuth(env: Bindings, token: string): Promise<AuthUser | null> {
  const found = await findUserByToken(env, token)
  if (found) return found
  if (!env.ADMIN_TOKEN || token !== env.ADMIN_TOKEN) return null
  try {
    return await bootstrapMaster(env, token)
  } catch {
    return null
  }
}

export async function listUsers(env: Bindings): Promise<AuthUser[]> {
  const rows = await env.DB.prepare(`SELECT id, name, role FROM users ORDER BY id`).all<AuthUser>()
  return rows.results
}

export async function getUser(env: Bindings, id: number): Promise<AuthUser | null> {
  const row = await env.DB.prepare(`SELECT id, name, role FROM users WHERE id = ?`).bind(id).first<AuthUser>()
  return row ?? null
}

export async function createUser(
  env: Bindings,
  name: string,
): Promise<{ user: AuthUser; token: string } | { error: string }> {
  const clean = sanitizeUserName(name)
  if (!clean) return { error: "Нужно имя, до 40 символов" }
  const token = randomToken()
  try {
    const inserted = await env.DB.prepare(`INSERT INTO users (name, role, token_hash) VALUES (?, 'user', ?)`)
      .bind(clean, await hashToken(token))
      .run()
    const id = Number(inserted.meta.last_row_id)
    await env.DB.prepare(
      `INSERT INTO user_profiles (user_id, content, prefilter_keep, prefilter_drop, blacklist)
       VALUES (?, '', ?, ?, '[]')`,
    )
      .bind(id, JSON.stringify(DEFAULT_PREFILTER.keep), JSON.stringify(DEFAULT_PREFILTER.drop))
      .run()
    return { user: { id, name: clean, role: "user" }, token }
  } catch {
    return { error: "Не удалось создать пользователя" }
  }
}

export async function setUserName(
  env: Bindings,
  id: number,
  name: string,
): Promise<{ user: AuthUser } | { error: string; status: 400 | 404 }> {
  const clean = sanitizeUserName(name)
  if (!clean) return { error: "Нужно имя, до 40 символов", status: 400 }
  const user = await getUser(env, id)
  if (!user) return { error: "not found", status: 404 }
  await env.DB.prepare(`UPDATE users SET name = ? WHERE id = ?`).bind(clean, id).run()
  return { user: { ...user, name: clean } }
}

export async function setUserRole(
  env: Bindings,
  id: number,
  role: UserRole,
): Promise<{ user: AuthUser } | { error: string; status: 400 | 404 }> {
  const user = await getUser(env, id)
  if (!user) return { error: "not found", status: 404 }
  if (user.role === "master" && role === "user") {
    const masters = await env.DB.prepare(`SELECT COUNT(*) AS n FROM users WHERE role = 'master'`).first<{ n: number }>()
    if (Number(masters?.n) <= 1) return { error: "Нужен хотя бы один мастер", status: 400 }
  }
  await env.DB.prepare(`UPDATE users SET role = ? WHERE id = ?`).bind(role, id).run()
  return { user: { ...user, role } }
}

function parseJson(raw: string): unknown {
  try {
    return JSON.parse(raw) as unknown
  } catch {
    return null
  }
}

export async function loadUserProfile(env: Bindings, userId: number): Promise<UserProfileView | null> {
  const row = await env.DB.prepare(
    `SELECT content, prefilter_keep, prefilter_drop, blacklist FROM user_profiles WHERE user_id = ?`,
  )
    .bind(userId)
    .first<{ content: string; prefilter_keep: string; prefilter_drop: string; blacklist: string }>()
  if (!row) return null
  const keepParsed = parseJson(row.prefilter_keep)
  const dropParsed = parseJson(row.prefilter_drop)
  return {
    content: row.content,
    prefilter: {
      keep: Array.isArray(keepParsed) ? sanitizeTags(keepParsed) : DEFAULT_PREFILTER.keep,
      drop: Array.isArray(dropParsed) ? sanitizeTags(dropParsed) : DEFAULT_PREFILTER.drop,
    },
    blacklist: sanitizeCompanyBlacklist(parseJson(row.blacklist)),
  }
}

export async function saveUserContent(env: Bindings, userId: number, content: string): Promise<void> {
  await env.DB.prepare(`UPDATE user_profiles SET content = ? WHERE user_id = ?`).bind(content, userId).run()
}

export async function saveUserPrefilter(
  env: Bindings,
  userId: number,
  keep: unknown,
  drop: unknown,
): Promise<{ keep: string[]; drop: string[] }> {
  const next = { keep: sanitizeTags(keep), drop: sanitizeTags(drop) }
  await env.DB.prepare(`UPDATE user_profiles SET prefilter_keep = ?, prefilter_drop = ? WHERE user_id = ?`)
    .bind(JSON.stringify(next.keep), JSON.stringify(next.drop), userId)
    .run()
  return next
}

export async function saveUserBlacklist(
  env: Bindings,
  userId: number,
  items: unknown,
): Promise<BlacklistedCompany[]> {
  const list = sanitizeCompanyBlacklist(items)
  await env.DB.prepare(`UPDATE user_profiles SET blacklist = ? WHERE user_id = ?`)
    .bind(JSON.stringify(list), userId)
    .run()
  return list
}
