import telegramProvider from "../vendor/career-ops/telegram-channel.mjs"
import { fromCareerOps } from "./career-ops"

const RESERVED = new Set(["s", "share", "joinchat", "addstickers", "proxy", "iv"])

/** t.me/<channel> and its web preview t.me/s/<channel> both name the channel. */
export function telegramChannel(url: URL): string | null {
  if (url.hostname !== "t.me" && url.hostname !== "telegram.me") return null
  const parts = url.pathname.split("/").filter(Boolean)
  const channel = parts[0] === "s" ? parts[1] : parts[0]
  if (!channel || RESERVED.has(channel) || channel.startsWith("+")) return null
  return /^[a-z0-9_]{5,32}$/i.test(channel) ? channel : null
}

export const telegram = fromCareerOps(telegramProvider, {
  kind: "query",
  detect: telegramChannel,
  // 20 posts a page; three pages is a busy channel's week, and runs are daily.
  entry: (token) => ({ name: `@${token}`, channel: token, max_pages: 3, since_days: 14 }),
})
