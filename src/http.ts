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

export async function fetchJson(url: string, init: RequestInit = {}): Promise<unknown> {
  const res = await fetchResponse(url, init)
  if (!res.ok) {
    throw new Error(`GET ${url} failed: ${res.status}`)
  }
  return res.json()
}

export async function fetchText(url: string, init: RequestInit = {}): Promise<string> {
  const res = await fetchResponse(url, init)
  if (!res.ok) {
    throw new Error(`GET ${url} failed: ${res.status}`)
  }
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
