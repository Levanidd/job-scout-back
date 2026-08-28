import { detectToken, getAdapter } from "./adapters"
import { fetchResponse } from "./http"
import type { AdapterEnv, RawJob } from "./types"

const ATS_MARKERS: { re: RegExp; provider: string; group: number }[] = [
  { re: /boards\.greenhouse\.io\/embed\/job_board\?for=([a-z0-9_-]+)/i, provider: "greenhouse", group: 1 },
  { re: /job-boards\.greenhouse\.io\/([a-z0-9_-]+)/i, provider: "greenhouse", group: 1 },
  { re: /boards\.greenhouse\.io\/([a-z0-9_-]+)/i, provider: "greenhouse", group: 1 },
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
}

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

export async function detectUrl(input: string, env?: AdapterEnv): Promise<DetectResult> {
  let parsed: URL
  try {
    parsed = new URL(input)
  } catch {
    return { ats: null, token: null, ok: false, jobs_found: 0, sample: [] }
  }

  let found = detectToken(parsed)
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

  if (!found) {
    return { ats: null, token: null, ok: false, jobs_found: 0, sample: [] }
  }

  try {
    const adapter = getAdapter(found.provider)
    const jobs: RawJob[] = await adapter.fetchJobs(found.token, env)
    return {
      ats: found.provider,
      token: found.token,
      ok: true,
      jobs_found: jobs.length,
      sample: jobs.slice(0, 3).map((job) => job.title),
    }
  } catch {
    return {
      ats: found.provider,
      token: found.token,
      ok: false,
      jobs_found: 0,
      sample: [],
    }
  }
}
