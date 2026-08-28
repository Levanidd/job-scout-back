const KEEP =
  /product manager|product owner|principal product|group product|head of product|product lead|technical product|platform product|ai product/i

const DROP = /intern|working student|praktikum|werkstudent|ausbildung/i

export function passesPrefilter(title: string): boolean {
  if (DROP.test(title)) return false
  return KEEP.test(title)
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
