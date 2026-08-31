import { Fragment, useCallback, useEffect, useRef, useState } from "react"

import { api, type JobFilters } from "../api"
import { useAction } from "../app-context"
import { MultiSelect } from "../components/MultiSelect"
import { Age, Empty, Flags, ScoreBadge, Skeletons, formatDate } from "../components/common"
import type { CompanyFacet, Job, JobStatus } from "../types"

const STATUS_LABELS: Record<JobStatus, string> = {
  new: "новая",
  notified: "отправлена",
  saved: "сохранена",
  applied: "откликнулся",
  rejected: "отказ",
  ignored: "скрыта",
  off_profile: "вне профиля",
}

const ACTIONS: Array<{ status: JobStatus; label: string }> = [
  { status: "saved", label: "Сохранить" },
  { status: "rejected", label: "Отказ" },
  { status: "ignored", label: "Скрыть" },
]

export function Jobs({ preset }: { preset?: JobFilters }) {
  const run = useAction()
  const [filters, setFilters] = useState<JobFilters>(preset ?? { min_score: 55 })
  const [jobs, setJobs] = useState<Job[] | null>(null)
  const [companies, setCompanies] = useState<CompanyFacet[]>([])
  const [open, setOpen] = useState<string | null>(null)

  // Unchecking "откликнулся" should not erase where the job stood before.
  const previous = useRef(new Map<string, JobStatus>())

  const { status, min_score: minScore, tier } = filters
  const picked = filters.companies ?? []

  const load = useCallback(async () => {
    setJobs(null)
    const result = await run(() => api.jobs(filters))
    setJobs(result?.jobs ?? [])
  }, [run, filters])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    void (async () => {
      const result = await run(() => api.jobCompanies({ status, min_score: minScore, tier }))
      setCompanies(result?.companies ?? [])
    })()
  }, [run, status, minScore, tier])

  async function setStatus(job: Job, next: JobStatus) {
    const result = await run(() => api.setJobStatus(job.id, next))
    if (!result) return
    setJobs((prev) => prev?.map((item) => (item.id === job.id ? { ...item, status: next } : item)) ?? null)
  }

  async function toggleApplied(job: Job) {
    if (job.status === "applied") {
      await setStatus(job, previous.current.get(job.id) ?? "saved")
      return
    }
    previous.current.set(job.id, job.status)
    await setStatus(job, "applied")
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
          onChange={(event) => {
            const next = event.target.value || undefined
            // Prefiltered jobs were never scored, so a score threshold would
            // silently empty the very list the user just asked for.
            const unscored = next === "any" || next === "off_profile"
            setFilters((prev) => ({
              ...prev,
              status: next,
              min_score: unscored ? 0 : prev.min_score,
            }))
          }}
        >
          <option value="">По профилю</option>
          <option value="any">Все, включая отсеянные</option>
          {(Object.keys(STATUS_LABELS) as JobStatus[]).map((item) => (
            <option key={item} value={item}>
              {STATUS_LABELS[item]}
            </option>
          ))}
        </select>

        <MultiSelect
          label="Компании"
          options={companies.map((item) => ({
            value: item.company_key,
            label: item.company,
            hint: String(item.jobs),
          }))}
          selected={picked}
          onChange={(values) => setFilters((prev) => ({ ...prev, companies: values.length ? values : undefined }))}
        />
      </div>

      {jobs === null ? (
        <Skeletons />
      ) : jobs.length === 0 ? (
        <Empty title="Ничего не нашлось" hint="Ослабьте фильтры или запустите прогон." />
      ) : (
        <>
          <p className="muted">
            {jobs.length} вакансий{picked.length > 0 ? ` · компаний в фильтре: ${picked.length}` : ""}
          </p>

          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th className="col-check" title="Отметьте, если откликнулись">
                    Подался
                  </th>
                  <th>Вакансия</th>
                  <th className="col-company">Компания</th>
                  <th className="col-score">Score</th>
                  <th className="col-date">Опубликована</th>
                  <th className="col-date" title="Когда последний раз видели вакансию в источнике">
                    Обновлена
                  </th>
                  <th className="col-more" />
                </tr>
              </thead>
              <tbody>
                {jobs.map((job) => (
                  <Fragment key={job.id}>
                    <tr className={job.status === "applied" ? "is-applied" : undefined}>
                      <td className="col-check">
                        <input
                          type="checkbox"
                          className="checkbox"
                          checked={job.status === "applied"}
                          aria-label={`Откликнулся: ${job.title}`}
                          onChange={() => void toggleApplied(job)}
                        />
                      </td>
                      <td>
                        <a href={job.url} target="_blank" rel="noreferrer">
                          {job.title}
                        </a>
                        <div className="cell-sub">
                          <span className="cell-company-inline">{job.company}</span>
                          {job.location ? <span>{job.location}</span> : null}
                        </div>
                      </td>
                      <td className="col-company">{job.company}</td>
                      <td className="col-score">
                        <ScoreBadge
                          score={job.status === "off_profile" ? null : job.score}
                          hint="Не оценивалась: название не подошло под профиль"
                        />
                      </td>
                      <td className="col-date">
                        <Age value={job.posted_at ?? job.first_seen_at} />
                        {job.posted_at ? null : <div className="cell-sub">найдена нами</div>}
                      </td>
                      <td className="col-date">
                        <Age value={job.last_seen_at} warnAfter={7} />
                      </td>
                      <td className="col-more">
                        <button
                          className="btn btn-ghost btn-sm"
                          aria-expanded={open === job.id}
                          onClick={() => setOpen((prev) => (prev === job.id ? null : job.id))}
                        >
                          {open === job.id ? "×" : "…"}
                        </button>
                      </td>
                    </tr>

                    {open === job.id ? (
                      <tr className="row-details">
                        <td colSpan={7}>
                          {job.score_reason ? (
                            <p className="muted">
                              {job.score_reason === "prefilter"
                                ? "Отсеяна по названию: роль не из продуктового списка, в скоринг не попала"
                                : job.score_reason}
                            </p>
                          ) : null}
                          <Flags raw={job.flags} />
                          <div className="row-tight" style={{ flexWrap: "wrap" }}>
                            <span className="badge badge-neutral">{STATUS_LABELS[job.status]}</span>
                            <span className="badge badge-neutral">
                              {job.tier === "watchlist" ? "watchlist" : "discovery"}
                            </span>
                            <span className="badge badge-neutral">{job.source_label}</span>
                            <span className="badge badge-neutral">
                              найдена {formatDate(job.first_seen_at)}
                            </span>
                          </div>
                          <div className="row">
                            {ACTIONS.map((action) => (
                              <button
                                key={action.status}
                                className={`btn btn-sm ${job.status === action.status ? "btn-primary" : ""}`}
                                onClick={() => void setStatus(job, action.status)}
                              >
                                {action.label}
                              </button>
                            ))}
                          </div>
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  )
}
