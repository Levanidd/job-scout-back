import type { Context } from "hono"

import type { AppEnv, AuthUser } from "./types"

export function currentUser(c: Context<AppEnv>): AuthUser {
  return c.get("user")
}

export function masterGuard(c: Context<AppEnv>): Response | null {
  if (c.get("user").role !== "master") return c.json({ error: "forbidden" }, 403)
  return null
}
