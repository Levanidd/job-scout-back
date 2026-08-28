import type { Bindings } from "./types"

type DigestJob = {
  company: string
  title: string
  url: string
  score: number
  reason: string | null
  flags: string | null
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
}

export function renderDigest(jobs: DigestJob[], newCompanies: number): string {
  const grouped = new Map<string, DigestJob[]>()
  for (const job of jobs.slice(0, 25)) {
    const list = grouped.get(job.company) ?? []
    list.push(job)
    grouped.set(job.company, list)
  }
  const blocks: string[] = ["<b>JobRadar</b>"]
  for (const [company, list] of grouped) {
    blocks.push(`\n<b>${escapeHtml(company)}</b>`)
    for (const job of list) {
      const reason = job.reason ? ` — ${escapeHtml(job.reason)}` : ""
      blocks.push(`• <a href="${escapeHtml(job.url)}">${escapeHtml(job.title)}</a> (${job.score})${reason}`)
    }
  }
  if (newCompanies > 0) {
    blocks.push(`\nновые компании: ${newCompanies}`)
  }
  return blocks.join("\n")
}

export async function sendTelegram(env: Bindings, text: string): Promise<boolean> {
  const token = env.TELEGRAM_BOT_TOKEN
  const chat = env.TELEGRAM_CHAT_ID
  if (!token || !chat) return false
  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      chat_id: chat,
      text,
      parse_mode: "HTML",
      disable_web_page_preview: true,
    }),
  })
  if (!res.ok) throw new Error(`Telegram failed: ${res.status}`)
  return true
}
