/**
 * Runs the vendored santifer/career-ops providers (src/vendor/career-ops) as
 * our adapters.
 *
 * Their providers take an injected HTTP client and a config entry, so they run
 * unmodified against our own fetch layer. Keeping them verbatim means we can
 * re-vendor a fixed upstream file without reapplying edits, so everything that
 * differs between their model and ours lives here instead.
 */

import { fetchJson, fetchResponse, fetchText, toIso } from "../http"
import { clipDescription } from "../prefilter"
import type { Adapter, RawJob } from "../types"

/** Their normalized posting (providers/_types.js `Job`). */
export type CareerOpsJob = {
  title?: string
  url?: string
  company?: string
  location?: string
  description?: string
  postedAt?: number
}

/** Their `FetchOptions`, which is RequestInit plus a timeout they let us ignore. */
export type CareerOpsFetchOptions = {
  timeoutMs?: number
  headers?: Record<string, string>
  method?: string
  body?: string | null
  redirect?: "error" | "follow" | "manual"
}

export type CareerOpsContext = {
  transport: "http"
  fetchText(url: string, opts?: CareerOpsFetchOptions): Promise<string>
  fetchJson(url: string, opts?: CareerOpsFetchOptions): Promise<unknown>
  fetchResponse(url: string, opts?: CareerOpsFetchOptions): Promise<Response>
  sleep(ms: number): Promise<void>
}

export type CareerOpsProvider = {
  id: string
  detect?(entry: Record<string, unknown>): { url: string } | null
  fetch(entry: Record<string, unknown>, ctx: CareerOpsContext): Promise<CareerOpsJob[]>
}

/**
 * Workers' fetch has no `redirect: "error"`, which their providers pass on
 * every call to stop a board bouncing them onto another host. Asking for a
 * manual redirect gives the same guarantee: a 3xx arrives as a non-ok
 * response, which our fetchJson/fetchText already reject.
 */
function toInit(opts: CareerOpsFetchOptions = {}): RequestInit {
  const { redirect, timeoutMs: _ignored, ...rest } = opts
  return { ...rest, redirect: redirect === "error" ? "manual" : redirect }
}

function createContext(): CareerOpsContext {
  return {
    transport: "http",
    fetchText: (url, opts) => fetchText(url, toInit(opts)),
    fetchJson: (url, opts) => fetchJson(url, toInit(opts)),
    fetchResponse: async (url, opts) => {
      const res = await fetchResponse(url, toInit(opts))
      // Only the raw-response path has to check by hand; the others see !ok.
      if (opts?.redirect === "error" && res.status >= 300 && res.status < 400) {
        throw new Error(`${url} redirected to ${res.headers.get("location") ?? "another host"}`)
      }
      return res
    },
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  }
}

const HOST_NOISE = new Set(["www", "careers", "career", "jobs", "job", "apply", "hiring", "join"])

/**
 * A single-company board is the company, so its payload never repeats the name
 * and the providers read it off the config entry instead. The board URL is all
 * we have to name it by: `join.com/companies/acme` and `acme.teamtailor.com`
 * both come out as "acme".
 */
export function labelFromUrl(raw: string): string {
  try {
    const url = new URL(raw)
    const path = url.pathname.match(/\/companies\/([^/?#]+)/)
    if (path?.[1]) return decodeURIComponent(path[1])
    const labels = url.hostname.toLowerCase().split(".").filter(Boolean)
    return labels.slice(0, -1).find((label) => !HOST_NOISE.has(label)) ?? url.hostname
  } catch {
    return raw
  }
}

export type BridgeOptions = {
  kind: "company" | "query"
  /** Overrides their entry-based detect, which cannot see a bare URL. */
  detect?(url: URL): string | null
  /** Builds the config entry their provider reads; defaults to a careers URL. */
  entry?(token: string): Record<string, unknown>
  /**
   * Board-wide feeds hand back everything and let the caller filter. Their
   * scanner does that downstream; for us the source's token is the needle.
   */
  filterLocally?: boolean
}

export function fromCareerOps(provider: CareerOpsProvider, options: BridgeOptions): Adapter {
  return {
    provider: provider.id,
    kind: options.kind,
    detect(url) {
      if (options.detect) return options.detect(url)
      // Their detect answers "is this mine?"; the URL itself is then the token,
      // since that is all their fetch() needs to find the board.
      return provider.detect?.({ careers_url: url.href }) ? url.href : null
    },
    async fetchJobs(token) {
      const entry = options.entry?.(token) ?? {
        name: labelFromUrl(token),
        careers_url: token,
        api: token,
        provider: provider.id,
      }
      const jobs = await provider.fetch(entry, createContext())
      const needle = options.filterLocally ? token.trim().toLowerCase() : ""
      const out: RawJob[] = []
      for (const job of jobs) {
        const title = job?.title?.trim()
        const url = job?.url?.trim()
        if (!title || !url) continue
        const company = job.company?.trim() || undefined
        if (needle && needle !== "*" && !`${title} ${company ?? ""}`.toLowerCase().includes(needle)) {
          continue
        }
        out.push({
          externalId: url,
          title,
          company,
          location: job.location?.trim() || undefined,
          url,
          description: clipDescription(job.description),
          postedAt: toIso(job.postedAt),
        })
      }
      return out
    },
  }
}
