import { useCallback, useEffect, useState } from "react"

import { api, type JobFilters } from "../api"
import { useAction } from "../app-context"
import { Empty, Flags, ScoreBadge, Skeletons, formatDate } from "../components/common"
import type { Job, JobStatus } from "../types"

const STATUS_LABELS: Record<JobStatus, string> = {
  new: "новая",
  notified: "отправлена",
  saved: "сохранена",
  applied: "откликнулся",
  rejected: "отказ",
  ignored: "скрыта",
}

const ACTIONS: Array<{ status: JobStatus; label: string }> = [
  { status: "saved", label: "Сохранить" },
  { status: "applied", label: "Откликнулся" },
  { status: "rejected", label: "Отказ" },
]

export function Jobs() {
  const run = useAction()
  const [filters, setFilters] = useState<JobFilters>({ min_score: 55 })
  const [jobs, setJobs] = useState<Job[] | null>(null)

  const load = useCallback(async () => {
    setJobs(null)
    const result = await run(() => api.jobs(filters))
    setJobs(result?.jobs ?? [])
  }, [run, filters])

  useEffect(() => {
    void load()
  }, [load])

  async function setStatus(job: Job, status: JobStatus) {
    const result = await run(() => api.setJobStatus(job.id, status))
    if (!result) return
    setJobs((prev) => prev?.map((item) => (item.id === job.id ? { ...item, status } : item)) ?? null)
  }

  return (
    <>
      <div className="filters">
        <select
          className="select"
          value={filters.tier ?? ""}
          onChange={(event) => setFilters((prev) => ({ ...prev, tier: event.target.value || undefined }))}
        >
          <option value="">Все источники</option>
          <option value="watchlist">Watchlist</option>
          <option value="discovery">Discovery</option>
        </select>

        <select
          className="select"
          value={String(filters.min_score ?? 0)}
          onChange={(event) => setFilters((prev) => ({ ...prev, min_score: Number(event.target.value) }))}
        >
          <option value="0">Любой score</option>
          <option value="40">от 40</option>
          <option value="55">от 55</option>
          <option value="70">от 70</option>
          <option value="85">от 85</option>
        </select>

        <select
          className="select"
          value={filters.status ?? ""}
          onChange={(event) => setFilters((prev) => ({ ...prev, status: event.target.value || undefined }))}
        >
          <option value="">Кроме скрытых</option>
          {(Object.keys(STATUS_LABELS) as JobStatus[]).map((status) => (
            <option key={status} value={status}>
              {STATUS_LABELS[status]}
            </option>
          ))}
        </select>

        <input
          className="input"
          placeholder="Компания"
          value={filters.company ?? ""}
          onChange={(event) => setFilters((prev) => ({ ...prev, company: event.target.value || undefined }))}
        />
      </div>

      {jobs === null ? (
        <Skeletons />
      ) : jobs.length === 0 ? (
        <Empty title="Ничего не нашлось" hint="Ослабьте фильтры или запустите прогон." />
      ) : (
        jobs.map((job) => (
          <article key={job.id} className="card">
            <div className="card-head">
              <div>
                <h3 className="card-title">{job.title}</h3>
                <p className="card-sub">
                  {job.company}
                  {job.location ? ` · ${job.location}` : ""}
                </p>
              </div>
              <ScoreBadge score={job.score} />
            </div>

            {job.score_reason ? <p className="muted">{job.score_reason}</p> : null}
            <Flags raw={job.flags} />

            <div className="row-tight" style={{ flexWrap: "wrap" }}>
              <span className="badge badge-neutral">{job.tier === "watchlist" ? "watchlist" : "discovery"}</span>
              <span className="badge badge-neutral">{STATUS_LABELS[job.status]}</span>
              <span className="badge badge-neutral">{formatDate(job.first_seen_at)}</span>
            </div>

            <hr className="divider" />

            <div className="row">
              <a className="btn btn-ghost btn-sm" href={job.url} target="_blank" rel="noreferrer">
                Открыть
              </a>
              {ACTIONS.map((action) => (
                <button
                  key={action.status}
                  className={`btn btn-sm ${job.status === action.status ? "btn-primary" : ""}`}
                  onClick={() => void setStatus(job, action.status)}
                >
                  {action.label}
                </button>
              ))}
              <button className="btn btn-ghost btn-sm" onClick={() => void setStatus(job, "ignored")}>
                Скрыть
              </button>
            </div>
          </article>
        ))
      )}
    </>
  )
}
