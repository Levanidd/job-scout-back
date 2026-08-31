export const USER_AGENT = "JobRadar/1.0 (personal job search)"

async function once(url: string, init: RequestInit): Promise<Response> {
  return fetch(url, {
    ...init,
    headers: {
      "User-Agent": USER_AGENT,
      ...(init.headers ?? {}),
    },
    signal: AbortSignal.timeout(15_000),
  })
}

export async function fetchResponse(url: string, init: RequestInit = {}): Promise<Response> {
  try {
    const res = await once(url, init)
    if (res.status >= 500) {
      return once(url, init)
    }
    return res
  } catch {
    return once(url, init)
  }
}

export type HttpError = Error & { status: number; retryAfter: string | null; body: string }

/**
 * Carries the status and Retry-After so a caller can tell a rate limit from a
 * dead board. Retrying a 404 only burns time; retrying a 429 is the point.
 */
async function fail(url: string, res: Response): Promise<never> {
  const error = new Error(`GET ${url} failed: ${res.status}`) as HttpError
  error.status = res.status
  error.retryAfter = res.headers.get("retry-after")
  error.body = await res.text().catch(() => "")
  throw error
}

export async function fetchJson(url: string, init: RequestInit = {}): Promise<unknown> {
  const res = await fetchResponse(url, init)
  if (!res.ok) await fail(url, res)
  return res.json()
}

export async function fetchText(url: string, init: RequestInit = {}): Promise<string> {
  const res = await fetchResponse(url, init)
  if (!res.ok) await fail(url, res)
  return res.text()
}

export function asRecord(value: unknown): Record<string, unknown> | null {
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>
  }
  return null
}

export function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

export function str(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim()) return value
  if (typeof value === "number") return String(value)
  return undefined
}

/**
 * Accept a URL from a feed payload only when it is HTTPS and stays on the
 * board's own host. A board that starts emitting third-party links is a
 * change we want to notice, not follow.
 */
export function trustedUrl(value: unknown, host: string): string | undefined {
  const raw = str(value)?.trim()
  if (!raw) return undefined
  try {
    const parsed = new URL(raw)
    if (parsed.protocol !== "https:") return undefined
    const found = parsed.hostname.toLowerCase()
    if (found !== host && !found.endsWith(`.${host}`)) return undefined
    return parsed.href
  } catch {
    return undefined
  }
}

const MS_THRESHOLD = 1_000_000_000_000

/** Feeds date postings as epoch seconds, epoch ms, or a parseable string. */
export function toIso(value: unknown): string | undefined {
  let ms: number | undefined
  if (typeof value === "number" && Number.isFinite(value)) {
    ms = value < MS_THRESHOLD ? value * 1000 : value
  } else if (typeof value === "string" && value.trim()) {
    const numeric = Number(value)
    if (Number.isFinite(numeric)) {
      ms = numeric < MS_THRESHOLD ? numeric * 1000 : numeric
    } else {
      const parsed = Date.parse(value)
      ms = Number.isNaN(parsed) ? undefined : parsed
    }
  }
  if (ms === undefined || !Number.isFinite(ms)) return undefined
  return new Date(ms).toISOString()
}
