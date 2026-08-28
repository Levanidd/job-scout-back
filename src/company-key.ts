const SUFFIX = /\b(gmbh|se|ag|ltd|inc|b\.v\.|bv|llc|plc|kg|ohg|ug)\b/gi

export function companyKey(name: string): string {
  return name
    .toLowerCase()
    .replace(SUFFIX, " ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
}

export async function jobHash(provider: string, token: string, externalId: string): Promise<string> {
  const bytes = new TextEncoder().encode(`${provider}:${token}:${externalId}`)
  const digest = await crypto.subtle.digest("SHA-256", bytes)
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("")
}
