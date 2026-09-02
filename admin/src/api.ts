import type {
  BulkDetectResult,
  Cycle,
  CompanyFacet,
  DetectResult,
  DiscoveredCompany,
  ExploreBoard,
  ExploreCompany,
  Job,
  JobStatus,
  ModelOption,
  RunResult,
  BlacklistedCompany,
  PrefilterRules,
  Settings,
  Source,
  ThinkingLevel,
  Tier,
} from "./types"

const STORAGE_KEY = "jobradar.token"

let token = sessionStorage.getItem(STORAGE_KEY) ?? ""

export class UnauthorizedError extends Error {
  constructor() {
    super("Неверный токен")
  }
}

export function getToken(): string {
  return token
}

export function setToken(value: string): void {
  token = value
  sessionStorage.setItem(STORAGE_KEY, value)
}

export function forgetToken(): void {
  token = ""
  sessionStorage.removeItem(STORAGE_KEY)
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers)
  headers.set("Authorization", `Bearer ${token}`)
  if (init?.body) headers.set("Content-Type", "application/json")

  const res = await fetch(`/api${path}`, { ...init, headers })
  if (res.status === 401) throw new UnauthorizedError()

  const payload: unknown = await res.json().catch(() => null)
  if (!res.ok) {
    const message =
      payload && typeof payload === "object" && "error" in payload
        ? String((payload as { error: unknown }).error)
        : `Ошибка ${res.status}`
    throw new Error(message)
  }
  return payload as T
}

function post<T>(path: string, body?: unknown): Promise<T> {
  return request<T>(path, { method: "POST", body: body ? JSON.stringify(body) : undefined })
}

export type JobSort = "applied" | "title" | "company" | "score" | "posted" | "updated" | "added"

export type JobFilters = {
  status?: string
  min_score?: number
  companies?: string[]
  source_id?: number
  source_label?: string
  tier?: string
  added_days?: number
  added_from?: string
  sort?: JobSort
  dir?: "asc" | "desc"
}

function jobQuery(filters: JobFilters): string {
  const params = new URLSearchParams()
  if (filters.status) params.set("status", filters.status)
  if (filters.min_score) params.set("min_score", String(filters.min_score))
  if (filters.companies?.length) params.set("companies", filters.companies.join(","))
  if (filters.source_id) params.set("source_id", String(filters.source_id))
  if (filters.tier) params.set("tier", filters.tier)
  if (filters.added_days) params.set("added_days", String(filters.added_days))
  if (filters.added_from) params.set("added_from", filters.added_from)
  if (filters.sort) params.set("sort", filters.sort)
  if (filters.dir) params.set("dir", filters.dir)
  const query = params.toString()
  return query ? `?${query}` : ""
}

export const api = {
  async verify(): Promise<void> {
    await request("/profile")
  },

  jobs(filters: JobFilters): Promise<{ jobs: Job[] }> {
    return request(`/jobs${jobQuery(filters)}`)
  },

  jobCompanies(filters: JobFilters): Promise<{ companies: CompanyFacet[] }> {
    return request(`/jobs/companies${jobQuery({ ...filters, companies: undefined, source_label: undefined, sort: undefined, dir: undefined })}`)
  },

  setJobStatus(id: string, status: JobStatus): Promise<{
    ok: true
    status: JobStatus
    notes: string | null
    applied_at: string | null
  }> {
    return request(`/jobs/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    })
  },

  saveJobNotes(id: string, notes: string): Promise<{
    ok: true
    status: JobStatus
    notes: string | null
    applied_at: string | null
  }> {
    return request(`/jobs/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify({ notes }),
    })
  },

  job(id: string): Promise<{ job: Job }> {
    return request(`/jobs/${encodeURIComponent(id)}`)
  },

  applied(status?: string): Promise<{ jobs: Job[] }> {
    const query = status ? `?status=${encodeURIComponent(status)}` : ""
    return request(`/applied${query}`)
  },

  createApplied(body: {
    title: string
    company: string
    url: string
    location?: string
    description?: string
    notes?: string
    salary_min?: number | null
    salary_max?: number | null
    salary_currency?: string
    status?: "applied" | "interview"
    applied_at?: string
  }): Promise<{ job: Job }> {
    return request("/applied", { method: "POST", body: JSON.stringify(body) })
  },

  scoreJob(id: string): Promise<{
    id: string
    score: number
    score_reason: string | null
    flags: string | null
    status: JobStatus
  }> {
    return post(`/jobs/${encodeURIComponent(id)}/score`)
  },

  scoreJobs(ids: string[]): Promise<{
    jobs: Array<{
      id: string
      score: number
      score_reason: string | null
      flags: string | null
      status: JobStatus
    }>
  }> {
    return post("/jobs/score", { ids })
  },

  discovered(): Promise<{ companies: DiscoveredCompany[] }> {
    return request("/discovered")
  },

  addDiscovered(key: string): Promise<{ added: boolean; ats: string | null }> {
    return post(`/discovered/${encodeURIComponent(key)}/add`)
  },

  dismissDiscovered(key: string): Promise<{ ok: true }> {
    return post(`/discovered/${encodeURIComponent(key)}/dismiss`)
  },

  exploreBoards(): Promise<{ boards: ExploreBoard[] }> {
    return request("/explore/boards")
  },

  explorePrepare(providers: string[]): Promise<{
    sources: { id: number; label: string; provider: string }[]
    created: number
  }> {
    return post("/explore/prepare", { providers })
  },

  explore(providers: string[]): Promise<{ companies: ExploreCompany[] }> {
    const query = encodeURIComponent(providers.join(","))
    return request(`/explore?providers=${query}`)
  },

  addExplore(key: string): Promise<{ added: boolean; ats: string | null }> {
    return post(`/explore/${encodeURIComponent(key)}/add`)
  },

  sources(): Promise<{ sources: Source[] }> {
    return request("/sources")
  },

  createSource(body: {
    kind: "company" | "query"
    tier: Tier
    label: string
    provider: string
    token: string
    careers_url?: string
  }): Promise<{ ok: true }> {
    return post("/sources", body)
  },

  updateSource(id: number, body: { enabled?: number; tier?: Tier; label?: string }): Promise<{ ok: true }> {
    return request(`/sources/${id}`, { method: "PATCH", body: JSON.stringify(body) })
  },

  deleteSource(id: number): Promise<{ ok: true }> {
    return request(`/sources/${id}`, { method: "DELETE" })
  },

  runSource(id: number, options: { score?: boolean } = {}): Promise<{ run: RunResult; scored: number }> {
    return post(`/sources/${id}/run${options.score === false ? "?score=0" : ""}`)
  },

  cycle(): Promise<Cycle> {
    return request("/run")
  },

  startCycle(): Promise<Cycle> {
    return post("/run")
  },

  detect(url: string): Promise<DetectResult> {
    return post("/detect", { url })
  },

  bulkDetect(urls: string[]): Promise<{ results: BulkDetectResult[] }> {
    return post("/sources/bulk-detect", { urls })
  },

  profile(): Promise<{
    content: string
    prefilter?: PrefilterRules
    blacklist?: BlacklistedCompany[]
    companies?: BlacklistedCompany[]
  }> {
    return request("/profile")
  },

  saveProfile(content: string): Promise<{ ok: true; prefilter?: PrefilterRules }> {
    return request("/profile", { method: "PUT", body: JSON.stringify({ content }) })
  },

  savePrefilter(prefilter: PrefilterRules): Promise<{
    ok: true
    prefilter: PrefilterRules
    applied?: { dropped: number; restored: number }
  }> {
    return request("/profile", { method: "PUT", body: JSON.stringify({ prefilter }) })
  },

  saveBlacklist(blacklist: BlacklistedCompany[]): Promise<{ ok: true; blacklist: BlacklistedCompany[] }> {
    return request("/profile", { method: "PUT", body: JSON.stringify({ blacklist }) })
  },

  rescore(): Promise<{ ok: true; scored: number }> {
    return post("/profile/rescore")
  },

  settings(): Promise<Settings> {
    return request("/settings")
  },

  models(): Promise<{ models: ModelOption[]; error?: string }> {
    return request("/models")
  },

  saveSettings(body: { model?: string; thinking_level?: ThinkingLevel }): Promise<Settings> {
    return request("/settings", { method: "PUT", body: JSON.stringify(body) })
  },
}
