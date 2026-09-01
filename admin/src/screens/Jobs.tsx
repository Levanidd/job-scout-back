import { Fragment, useCallback, useEffect, useRef, useState } from "react"

import { api, type JobFilters, type JobSort } from "../api"
import { useAction, useApp } from "../app-context"
import { MultiSelect } from "../components/MultiSelect"
import { SortHeader } from "../components/SortHeader"
import { Age, Empty, Flags, ScoreBadge, Skeletons, formatDate, plural } from "../components/common"
import type { CompanyFacet, Job, JobStatus } from "../types"

const STATUS_LABELS: Record<JobStatus, string> = {
  new: "новая",
  notified: "отправлена",
  saved: "сохранена",
  applied: "откликнулся",
  interview: "интервью",
  rejected: "отказ",
  ignored: "скрыта",
  off_profile: "вне профиля",
}

const ACTIONS: Array<{ status: JobStatus; label: string }> = [
  { status: "saved", label: "Сохранить" },
  { status: "rejected", label: "Отказ" },
  { status: "ignored", label: "Скрыть" },
]

const DEFAULT_DIR: Record<JobSort, "asc" | "desc"> = {
  applied: "desc",
  title: "asc",
  company: "asc",
  score: "desc",
  posted: "desc",
  updated: "desc",
  added: "desc",
}

export function Jobs({ preset }: { preset?: JobFilters }) {
  const run = useAction()
  const { refreshTick, refresh, notify } = useApp()
  const [filters, setFilters] = useState<JobFilters>({
    min_score: 55,
    sort: "score",
    dir: "desc",
    ...preset,
  })
  const [jobs, setJobs] = useState<Job[] | null>(null)
  const [companies, setCompanies] = useState<CompanyFacet[]>([])
  const [open, setOpen] = useState<string | null>(null)
  const [scoring, setScoring] = useState<string | null>(null)
  const [batch, setBatch] = useState<{ done: number; total: number } | null>(null)

  // Unchecking "откликнулся" should not erase where the job stood before.
  const previous = useRef(new Map<string, JobStatus>())

  const { status, min_score: minScore, tier, added_days: addedDays, added_from: addedFrom } = filters
  const picked = filters.companies ?? []

  const load = useCallback(async (silent = false) => {
    if (!silent) setJobs(null)
    const result = await run(() => api.jobs(filters))
    if (result) setJobs(result.jobs)
  }, [run, filters])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (!refreshTick) return
    void load(true)
  }, [refreshTick, load])

  useEffect(() => {
    void (async () => {
      const result = await run(() =>
        api.jobCompanies({ status, min_score: minScore, tier, added_days: addedDays, added_from: addedFrom }),
      )
      if (result) setCompanies(result.companies)
    })()
  }, [run, status, minScore, tier, addedDays, addedFrom, refreshTick])

  async function setStatus(job: Job, next: JobStatus) {
    const result = await run(() => api.setJobStatus(job.id, next))
    if (!result) return
    setJobs(
      (prev) =>
        prev?.map((item) =>
          item.id === job.id ? { ...item, status: result.status, applied_at: result.applied_at } : item,
        ) ?? null,
    )
  }

  function inPipeline(job: Job): boolean {
    return Boolean(job.applied_at) || job.status === "applied" || job.status === "interview"
  }

  function applyScores(
    updates: Array<{
      id: string
      score: number
      score_reason: string | null
      flags: string | null
      status: JobStatus
    }>,
  ) {
    const byId = new Map(updates.map((item) => [item.id, item]))
    setJobs(
      (prev) =>
        prev?.map((item) => {
          const next = byId.get(item.id)
          return next
            ? {
                ...item,
                score: next.score,
                score_reason: next.score_reason,
                flags: next.flags,
                status: next.status,
              }
            : item
        }) ?? null,
    )
  }

  async function rescore(job: Job) {
    setScoring(job.id)
    const result = await run(() => api.scoreJob(job.id))
    setScoring(null)
    if (!result) return
    notify(`Score ${result.score}`)
    applyScores([result])
  }

  async function rescoreFiltered() {
    if (!jobs?.length || batch) return
    const ids = jobs.map((job) => job.id)
    setBatch({ done: 0, total: ids.length })
    let done = 0
    try {
      for (let i = 0; i < ids.length; i += 10) {
        const chunk = ids.slice(i, i + 10)
        const result = await run(() => api.scoreJobs(chunk))
        if (!result) return
        applyScores(result.jobs)
        done += result.jobs.length
        setBatch({ done, total: ids.length })
      }
      notify(`Пересчитан score у ${done} ${plural(done, ["вакансии", "вакансий", "вакансий"])}`)
    } finally {
      setBatch(null)
    }
  }

  async function toggleApplied(job: Job) {
    if (inPipeline(job)) {
      await setStatus(job, previous.current.get(job.id) ?? "saved")
      return
    }
    previous.current.set(job.id, job.status)
    await setStatus(job, "applied")
  }

  function sortBy(column: JobSort) {
    setFilters((prev) => {
      const dir = prev.sort === column ? (prev.dir === "asc" ? "desc" : "asc") : DEFAULT_DIR[column]
      return { ...prev, sort: column, dir }
    })
  }

  const sort = filters.sort ?? "score"
  const dir = filters.dir ?? "desc"

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

        <select
          className="select"
          value={filters.added_from ? "from" : String(filters.added_days ?? "")}
          onChange={(event) => {
            const value = event.target.value
            if (value === "from") return
            setFilters((prev) => ({
              ...prev,
              added_days: value ? Number(value) : undefined,
              added_from: undefined,
            }))
          }}
        >
          <option value="">Добавлена когда угодно</option>
          <option value="1">сегодня</option>
          <option value="3">за 3 дня</option>
          <option value="7">за неделю</option>
          <option value="30">за месяц</option>
          {filters.added_from ? <option value="from">с {filters.added_from}</option> : null}
        </select>

        <input
          className="input"
          type="date"
          title="Добавлена не раньше этой даты"
          value={filters.added_from ?? ""}
          onChange={(event) =>
            setFilters((prev) => ({
              ...prev,
              added_from: event.target.value || undefined,
              added_days: undefined,
            }))
          }
        />

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
        <button className="btn btn-ghost btn-sm" onClick={() => refresh()}>
          Обновить
        </button>
      </div>

      {jobs === null ? (
        <Skeletons />
      ) : jobs.length === 0 ? (
        <Empty title="Ничего не нашлось" hint="Ослабьте фильтры или запустите прогон." />
      ) : (
        <>
          <div className="row">
            <p className="muted">
              {jobs.length} {plural(jobs.length, ["вакансия", "вакансии", "вакансий"])}
              {picked.length > 0 ? ` · компаний в фильтре: ${picked.length}` : ""}
              {batch ? ` · считаю ${batch.done} из ${batch.total}` : ""}
            </p>
            <button
              type="button"
              className="btn btn-sm"
              disabled={Boolean(scoring || batch)}
              onClick={() => void rescoreFiltered()}
            >
              {batch ? "Считаю…" : "Пересчитать score у всех"}
            </button>
          </div>

          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <SortHeader
                    column="applied"
                    label="Подался"
                    sort={sort}
                    dir={dir}
                    onSort={sortBy}
                    className="col-check"
                    title="Отметьте, если откликнулись"
                  />
                  <SortHeader column="title" label="Вакансия" sort={sort} dir={dir} onSort={sortBy} />
                  <SortHeader column="company" label="Компания" sort={sort} dir={dir} onSort={sortBy} className="col-company" />
                  <SortHeader column="score" label="Score" sort={sort} dir={dir} onSort={sortBy} className="col-score" />
                  <SortHeader
                    column="posted"
                    label="Опубликована"
                    sort={sort}
                    dir={dir}
                    onSort={sortBy}
                    className="col-date"
                  />
                  <SortHeader
                    column="added"
                    label="Добавлена"
                    sort={sort}
                    dir={dir}
                    onSort={sortBy}
                    className="col-date"
                    title="Когда мы впервые увидели вакансию"
                  />
                  <SortHeader
                    column="updated"
                    label="Обновлена"
                    sort={sort}
                    dir={dir}
                    onSort={sortBy}
                    className="col-date"
                    title="Когда вакансия изменилась у источника"
                  />
                  <th className="col-more" />
                </tr>
              </thead>
              <tbody>
                {jobs.map((job) => (
                  <Fragment key={job.id}>
                    <tr className={`${inPipeline(job) ? "is-applied" : ""} ${scoring === job.id || batch ? "is-busy" : ""}`.trim()}>
                      <td className="col-check">
                        <input
                          type="checkbox"
                          className="checkbox"
                          checked={inPipeline(job)}
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
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          disabled={Boolean(scoring === job.id || batch)}
                          onClick={() => void rescore(job)}
                        >
                          {scoring === job.id ? "Считаю…" : "Пересчитать score"}
                        </button>
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
                        <Age value={job.first_seen_at} warnAfter={14} />
                      </td>
                      <td className="col-date">
                        <Age value={job.changed_at ?? job.first_seen_at} warnAfter={7} />
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
                        <td colSpan={8}>
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
                            <button
                              className="btn btn-primary btn-sm"
                              disabled={Boolean(scoring === job.id || batch)}
                              onClick={() => void rescore(job)}
                            >
                              {scoring === job.id ? "Считаю…" : "Пересчитать score"}
                            </button>
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
