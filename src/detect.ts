import { detectToken, getAdapter } from "./adapters"
import { fetchResponse } from "./http"
import type { AdapterEnv, RawJob } from "./types"

/** rss is a company adapter too, but its token is a feed URL — a bare slug means nothing there. */
const GUESSABLE = ["greenhouse", "lever", "ashby", "personio", "workable", "smartrecruiters", "recruitee"]

const HOST_NOISE = new Set(["www", "careers", "career", "jobs", "job", "apply", "hiring", "join"])

const ATS_MARKERS: { re: RegExp; provider: string; group: number }[] = [
  // The embed script is served both as `job_board?for=` and `job_board/js?for=`.
  { re: /boards\.greenhouse\.io\/embed\/job_board(?:\/js)?\?for=([a-z0-9_-]+)/i, provider: "greenhouse", group: 1 },
  { re: /job-boards\.greenhouse\.io\/([a-z0-9_-]+)/i, provider: "greenhouse", group: 1 },
  { re: /boards\.greenhouse\.io\/(?!embed\b)([a-z0-9_-]+)/i, provider: "greenhouse", group: 1 },
  { re: /jobs\.lever\.co\/([a-z0-9_-]+)/i, provider: "lever", group: 1 },
  { re: /api\.ashbyhq\.com\/posting-api\/job-board\/([a-z0-9_-]+)/i, provider: "ashby", group: 1 },
  { re: /jobs\.ashbyhq\.com\/([a-z0-9_-]+)/i, provider: "ashby", group: 1 },
  { re: /([a-z0-9-]+)\.jobs\.personio\.(?:de|com)/i, provider: "personio", group: 1 },
  { re: /apply\.workable\.com\/([a-z0-9_-]+)/i, provider: "workable", group: 1 },
  { re: /careers\.smartrecruiters\.com\/([a-z0-9_-]+)/i, provider: "smartrecruiters", group: 1 },
  { re: /([a-z0-9-]+)\.recruitee\.com/i, provider: "recruitee", group: 1 },
]

export type DetectResult = {
  ats: string | null
  token: string | null
  ok: boolean
  jobs_found: number
  sample: string[]
  /** True when the board was found by guessing the slug rather than reading it off the page. */
  guessed: boolean
}

type Found = { provider: string; token: string; jobs?: RawJob[] }

function matchMarkers(haystack: string): { provider: string; token: string } | null {
  for (const marker of ATS_MARKERS) {
    const m = haystack.match(marker.re)
    const token = m?.[marker.group]
    if (token) return { provider: marker.provider, token }
  }
  return null
}

async function collectPageText(res: Response): Promise<string> {
  if (typeof HTMLRewriter === "undefined") {
    return res.text()
  }
  const chunks: string[] = []
  const rewriter = new HTMLRewriter()
    .on("a", {
      element(el) {
        chunks.push(el.getAttribute("href") ?? "")
      },
    })
    .on("iframe", {
      element(el) {
        chunks.push(el.getAttribute("src") ?? "")
      },
    })
    .on("script", {
      element(el) {
        chunks.push(el.getAttribute("src") ?? "")
      },
    })
    .on("div", {
      element(el) {
        chunks.push(el.getAttribute("data-url") ?? "")
      },
    })
  await rewriter.transform(res).arrayBuffer()
  return chunks.join("\n")
}

function slugCandidates(url: URL): string[] {
  const labels = url.hostname.toLowerCase().split(".").filter(Boolean)
  // Everything but the TLD is fair game; `www.` and careers-y subdomains never name the company.
  const name = labels.slice(0, -1).find((label) => !HOST_NOISE.has(label))
  if (!name || !/^[a-z0-9-]+$/.test(name)) return []
  const compact = name.replace(/-/g, "")
  return compact === name ? [name] : [name, compact]
}

async function guessFromDomain(url: URL, env?: AdapterEnv): Promise<Found | null> {
  for (const token of slugCandidates(url)) {
    const hits = await Promise.all(
      GUESSABLE.map(async (provider) => {
        try {
          const jobs = await getAdapter(provider).fetchJobs(token, env)
          return jobs.length > 0 ? { provider, token, jobs } : null
        } catch {
          return null
        }
      }),
    )
    // Boards that exist but are empty look identical to typos, so only a populated one counts.
    const hit = hits.find((item) => item !== null)
    if (hit) return hit
  }
  return null
}

async function jobsFor(found: Found, env?: AdapterEnv): Promise<RawJob[] | null> {
  if (found.jobs) return found.jobs
  try {
    return await getAdapter(found.provider).fetchJobs(found.token, env)
  } catch {
    return null
  }
}

async function probe(url: string): Promise<{ provider: string; token: string } | null> {
  try {
    const parsed = new URL(url)
    const direct = detectToken(parsed)
    if (direct) return direct
    const res = await fetchResponse(url, { headers: { Accept: "text/html" } })
    if (!res.ok) return null
    const text = await collectPageText(res)
    return matchMarkers(text)
  } catch {
    return null
  }
}

const MISS: DetectResult = { ats: null, token: null, ok: false, jobs_found: 0, sample: [], guessed: false }

export async function detectUrl(input: string, env?: AdapterEnv): Promise<DetectResult> {
  let parsed: URL
  try {
    parsed = new URL(input)
  } catch {
    return MISS
  }

  let found: Found | null = detectToken(parsed)
  if (!found) {
    found = await probe(parsed.href)
  }
  if (!found) {
    for (const path of ["/careers", "/jobs", "/en/careers"]) {
      const guess = new URL(path, parsed.origin).href
      found = await probe(guess)
      if (found) break
    }
  }

  let jobs = found ? await jobsFor(found, env) : null
  let guessed = false

  // Pages that render listings client-side leave no ATS link, and a marker can still yield a
  // token that fetches nothing. Both cases are better served by guessing the slug than by giving up.
  if (!jobs?.length) {
    const fallback = await guessFromDomain(parsed, env)
    if (fallback) {
      found = fallback
      jobs = fallback.jobs ?? null
      guessed = true
    }
  }

  if (!found) {
    return MISS
  }

  return {
    ats: found.provider,
    token: found.token,
    ok: (jobs?.length ?? 0) > 0,
    jobs_found: jobs?.length ?? 0,
    sample: (jobs ?? []).slice(0, 3).map((job) => job.title),
    guessed,
  }
}
