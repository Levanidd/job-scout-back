export type Tier = "watchlist" | "discovery"

export type JobStatus = "new" | "notified" | "saved" | "applied" | "rejected" | "ignored"

export type Job = {
  id: string
  source_id: number
  company: string
  company_key: string
  title: string
  location: string | null
  url: string
  posted_at: string | null
  first_seen_at: string
  score: number | null
  score_reason: string | null
  flags: string | null
  status: JobStatus
  tier: Tier
  source_label: string
}

export type DiscoveredCompany = {
  company_key: string
  company: string
  first_seen_at: string
  hits: number
  best_score: number | null
  sample_url: string | null
  careers_url: string | null
  detected_ats: string | null
  state: "new" | "added" | "dismissed"
}

export type Source = {
  id: number
  kind: "company" | "query"
  tier: Tier
  label: string
  provider: string
  token: string
  careers_url: string | null
  enabled: number
  last_run_at: string | null
  last_count: number | null
  bootstrapped: number
  active_jobs: number
  last_error: string | null
  last_ok: number | null
}

export type DetectResult = {
  ats: string | null
  token: string | null
  ok: boolean
  jobs_found: number
  sample: string[]
  error?: string
}

export type BulkDetectResult = DetectResult & { url: string }

export type RunResult = {
  source_id: number
  ok: boolean
  jobs_found: number
  jobs_new: number
  error: string | null
  duration_ms: number
  suspicious: number
}

export type CycleResult = {
  runs: RunResult[]
  scored: number
  notified: number
}
