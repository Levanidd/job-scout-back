export type Tier = "watchlist" | "discovery"

export type JobStatus =
  | "new"
  | "notified"
  | "saved"
  | "applied"
  | "interview"
  | "rejected"
  | "ignored"
  /** Title did not match the prefilter, so it was never scored. */
  | "off_profile"

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
  last_seen_at: string
  changed_at?: string | null
  salary_min?: number | null
  salary_max?: number | null
  salary_currency?: string | null
  score: number | null
  score_reason: string | null
  flags: string | null
  status: JobStatus
  applied_at: string | null
  notes?: string | null
  description?: string | null
  tier: Tier
  source_label: string
}

export type CompanyFacet = {
  company_key: string
  company: string
  jobs: number
}

export type ExploreBoard = {
  provider: string
  label: string
  jobs: number
  ready: boolean
  sources: { id: number; label: string; enabled: number; jobs: number }[]
}

export type ExploreCompany = {
  company_key: string
  company: string
  jobs: number
  best_score: number | null
  sample_url: string | null
  providers: string
}

export type DiscoveredCompany = {
  company_key: string
  company: string
  first_seen_at: string
  /** How many times the ingest walked over this company's postings. */
  hits: number
  /** Postings we actually hold for it right now. */
  jobs_open: number
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
  created_at: string
}

export type DetectResult = {
  ats: string | null
  token: string | null
  ok: boolean
  jobs_found: number
  sample: string[]
  guessed: boolean
  error?: string
}

export type BulkDetectResult = DetectResult & { url: string }

export type ThinkingLevel = "LOW" | "MEDIUM" | "HIGH"

export type ModelOption = { id: string; label: string }

export type Settings = {
  model: string
  thinking_level: ThinkingLevel
  source: "database" | "secret" | "default"
  key_configured: boolean
}

export type PrefilterRules = {
  keep: string[]
  drop: string[]
}

export type RunResult = {
  source_id: number
  ok: boolean
  jobs_found: number
  jobs_new: number
  error: string | null
  duration_ms: number
  suspicious: number
}

export type PlannedSource = {
  id: number
  label: string
  provider: string
  tier: Tier
}

export type CycleStatus = "idle" | "running" | "done" | "error"

export type CyclePhase = "sources" | "scoring" | "digest"

export type Cycle = {
  status: CycleStatus
  phase: CyclePhase
  done: number
  total: number
  source_total: number
  current: string
  current_id: number | null
  found: number
  fresh: number
  failed: number
  scored: number
  notified: number
  error: string | null
  updated_at: string | null
}
