export type PrefilterRules = {
  keep: string[]
  drop: string[]
}

/** Title must contain at least one of these (case-insensitive, collapsed spaces). */
export const DEFAULT_KEEP = [
  "product manager",
  "product owner",
  "principal product",
  "group product",
  "head of product",
  "product lead",
  "technical product",
  "platform product",
  "ai product",
]

/** Title is rejected if it contains any of these, even when a keep tag also matches. */
export const DEFAULT_DROP = ["intern", "working student", "praktikum", "werkstudent", "ausbildung"]

export const DEFAULT_PREFILTER: PrefilterRules = { keep: DEFAULT_KEEP, drop: DEFAULT_DROP }

/** Trim and squeeze repeated whitespace; casing is kept for display. */
export function collapseSpaces(value: string): string {
  return value.trim().replace(/\s+/g, " ")
}

export function fold(value: string): string {
  return collapseSpaces(value).toLowerCase()
}

export function sanitizeTags(input: unknown): string[] {
  if (!Array.isArray(input)) return []
  const seen = new Set<string>()
  const out: string[] = []
  for (const item of input) {
    if (typeof item !== "string") continue
    const tag = collapseSpaces(item)
    if (!tag) continue
    const key = tag.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(tag)
    if (out.length >= 80) break
  }
  return out
}

export function titleHasTag(title: string, tag: string): boolean {
  const needle = fold(tag)
  if (!needle) return false
  return fold(title).includes(needle)
}

export function passesPrefilter(title: string, rules: PrefilterRules = DEFAULT_PREFILTER): boolean {
  if (rules.drop.some((tag) => titleHasTag(title, tag))) return false
  if (rules.keep.length === 0) return false
  return rules.keep.some((tag) => titleHasTag(title, tag))
}

export function stripHtml(input: string): string {
  return input
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim()
}

export function clipDescription(value: string | undefined): string | undefined {
  if (!value) return undefined
  const text = stripHtml(value)
  return text.length > 8000 ? text.slice(0, 8000) : text
}
