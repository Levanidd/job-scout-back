import { useCallback, useMemo, useState } from "react"

import { api } from "../api"
import { useAction, useLoader } from "../app-context"
import { oneOf, usePersistentState } from "../persist"
import { JobCard } from "../components/JobCard"
import { SortHeader } from "../components/SortHeader"
import { Age, Count, Empty, Field, ScoreBadge, Skeletons, formatSalary } from "../components/common"
import type { Job, JobStatus } from "../types"

function todayLocal(): string {
  const date = new Date()
  const pad = (value: number) => String(value).padStart(2, "0")
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

export type PipeFilter = "" | "applied" | "interview" | "rejected"
export type InterviewedFilter = "" | "yes" | "no"

const PIPE: Array<{ id: PipeFilter; label: string }> = [
  { id: "", label: "Все" },
  { id: "applied", label: "Подался" },
  { id: "interview", label: "Интервью" },
  { id: "rejected", label: "Отказ" },
]

const PIPE_ACTIONS: Array<{ status: JobStatus; label: string }> = [
  { status: "applied", label: "Подался" },
  { status: "interview", label: "Интервью" },
  { status: "rejected", label: "Отказ" },
]

const PIPE_LABELS: Record<"applied" | "interview" | "rejected", string> = {
  applied: "Подался",
  interview: "Интервью",
  rejected: "Отказ",
}

function pipeLabel(status: JobStatus): string {
  if (status === "applied" || status === "interview" || status === "rejected") return PIPE_LABELS[status]
  return status
}

type AppliedSort = "title" | "company" | "score" | "posted" | "added" | "updated" | "applied" | "status"

const DEFAULT_DIR: Record<AppliedSort, "asc" | "desc"> = {
  title: "asc",
  company: "asc",
  score: "desc",
  posted: "desc",
  added: "desc",
  updated: "desc",
  applied: "desc",
  status: "asc",
}

const PIPE_ORDER: Record<string, number> = { applied: 0, interview: 1, rejected: 2 }

function compare(a: Job, b: Job, sort: AppliedSort, dir: "asc" | "desc"): number {
  const sign = dir === "asc" ? 1 : -1
  let left: string | number = 0
  let right: string | number = 0
  switch (sort) {
    case "title":
      left = a.title.toLowerCase()
      right = b.title.toLowerCase()
      break
    case "company":
      left = a.company.toLowerCase()
      right = b.company.toLowerCase()
      break
    case "score":
      left = a.score ?? -1
      right = b.score ?? -1
      break
    case "posted":
      left = a.posted_at ?? a.first_seen_at ?? ""
      right = b.posted_at ?? b.first_seen_at ?? ""
      break
    case "added":
      left = a.first_seen_at ?? ""
      right = b.first_seen_at ?? ""
      break
    case "updated":
      left = a.changed_at ?? a.first_seen_at ?? ""
      right = b.changed_at ?? b.first_seen_at ?? ""
      break
    case "applied":
      left = a.applied_at ?? ""
      right = b.applied_at ?? ""
      break
    case "status":
      left = PIPE_ORDER[a.status] ?? 9
      right = PIPE_ORDER[b.status] ?? 9
      break
  }
  if (left < right) return -1 * sign
  if (left > right) return 1 * sign
  return a.id.localeCompare(b.id)
}

function reviveSort(raw: unknown): AppliedSort | null | undefined {
  if (raw === null || raw === "") return null
  return typeof raw === "string" && raw in DEFAULT_DIR ? (raw as AppliedSort) : undefined
}

function ManualJobForm({ onCreated, onCancel }: { onCreated: (job: Job) => void; onCancel: () => void }) {
  const run = useAction()
  const [busy, setBusy] = useState(false)
  const [title, setTitle] = useState("")
  const [company, setCompany] = useState("")
  const [url, setUrl] = useState("")
  const [location, setLocation] = useState("")
  const [appliedAt, setAppliedAt] = useState(todayLocal())
  const [status, setStatus] = useState<"applied" | "interview">("applied")
  const [salaryMin, setSalaryMin] = useState("")
  const [salaryMax, setSalaryMax] = useState("")
  const [currency, setCurrency] = useState("EUR")
  const [description, setDescription] = useState("")
  const [notes, setNotes] = useState("")

  async function submit() {
    setBusy(true)
    const result = await run(() =>
      api.createApplied({
        title,
        company,
        url,
        location: location || undefined,
        description: description || undefined,
        notes: notes || undefined,
        salary_min: salaryMin ? Number(salaryMin) : undefined,
        salary_max: salaryMax ? Number(salaryMax) : undefined,
        salary_currency: currency,
        status,
        applied_at: appliedAt || undefined,
      }),
    )
    setBusy(false)
    if (result) onCreated(result.job)
  }

  return (
    <article className="card">
      <h3 className="card-title">Своя вакансия</h3>
      <p className="card-sub">
        Для позиций без ATS: заполни карточку и приложи ссылку. Она сразу попадёт в «Подался».
      </p>

      <form
        className="form-grid"
        onSubmit={(event) => {
          event.preventDefault()
          void submit()
        }}
      >
        <div className="form-span">
          <Field label="Ссылка на позицию">
            <input
              className="input"
              type="url"
              required
              placeholder="https://"
              value={url}
              onChange={(event) => setUrl(event.target.value)}
            />
          </Field>
        </div>
        <Field label="Должность">
          <input
            className="input"
            required
            value={title}
            onChange={(event) => setTitle(event.target.value)}
          />
        </Field>
        <Field label="Компания">
          <input
            className="input"
            required
            value={company}
            onChange={(event) => setCompany(event.target.value)}
          />
        </Field>
        <Field label="Локация">
          <input
            className="input"
            placeholder="Berlin · Remote"
            value={location}
            onChange={(event) => setLocation(event.target.value)}
          />
        </Field>
        <Field label="Дата отклика">
          <input
            className="input"
            type="date"
            value={appliedAt}
            onChange={(event) => setAppliedAt(event.target.value)}
          />
        </Field>
        <div className="form-salary">
          <Field label="Зарплата от, в год">
            <input
              className="input"
              type="number"
              min={0}
              step={1000}
              placeholder="80000"
              value={salaryMin}
              onChange={(event) => setSalaryMin(event.target.value)}
            />
          </Field>
          <Field label="До">
            <input
              className="input"
              type="number"
              min={0}
              step={1000}
              placeholder="110000"
              value={salaryMax}
              onChange={(event) => setSalaryMax(event.target.value)}
            />
          </Field>
          <Field label="Валюта">
            <select className="select" value={currency} onChange={(event) => setCurrency(event.target.value)}>
              <option value="EUR">EUR</option>
              <option value="USD">USD</option>
              <option value="GBP">GBP</option>
              <option value="CHF">CHF</option>
            </select>
          </Field>
        </div>
        <Field label="Статус">
          <select
            className="select"
            value={status}
            onChange={(event) => setStatus(event.target.value as "applied" | "interview")}
          >
            <option value="applied">Подался</option>
            <option value="interview">Интервью</option>
          </select>
        </Field>
        <div className="form-span">
          <Field label="Описание">
            <textarea
              className="textarea textarea-notes"
              placeholder="Что требует роль, стек, условия…"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          </Field>
        </div>
        <div className="form-span">
          <Field label="Заметки">
            <textarea
              className="textarea textarea-notes"
              placeholder="С кем говорил, что отправил, следующие шаги…"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
            />
          </Field>
        </div>
        <div className="row form-span">
          <button className="btn btn-primary btn-sm" type="submit" disabled={busy}>
            {busy ? "Сохраняю…" : "Добавить"}
          </button>
          <button className="btn btn-ghost btn-sm" type="button" disabled={busy} onClick={onCancel}>
            Отмена
          </button>
        </div>
      </form>
    </article>
  )
}

export function Applied({
  preset,
  onOpenCompany,
}: {
  preset?: { status?: PipeFilter; interviewed?: InterviewedFilter }
  onOpenCompany: (company: { company_key: string }) => void
}) {
  const run = useAction()
  // A preset arrives from the Stats tab, where the user picked the bucket by
  // clicking a number — that pick should not become tomorrow's default view.
  const [status, setStatus] = usePersistentState<PipeFilter>(
    "applied.status",
    preset?.status ?? "",
    oneOf("", "applied", "interview", "rejected"),
    { store: !preset },
  )
  const [interviewed, setInterviewed] = usePersistentState<InterviewedFilter>(
    "applied.interviewed",
    preset?.interviewed ?? "",
    oneOf("", "yes", "no"),
    { store: !preset },
  )
  const [jobs, setJobs] = useState<Job[] | null>(null)
  const [open, setOpen] = useState<Job | null>(null)
  const [composing, setComposing] = useState(false)
  const [sort, setSort] = usePersistentState<AppliedSort | null>("applied.sort", null, reviveSort)
  const [dir, setDir] = usePersistentState<"asc" | "desc">("applied.dir", "desc", oneOf("asc", "desc"))

  const rows = useMemo(() => {
    if (!jobs || !sort) return jobs
    return [...jobs].sort((a, b) => compare(a, b, sort, dir))
  }, [jobs, sort, dir])

  function sortBy(column: AppliedSort) {
    if (sort !== column) {
      setSort(column)
      setDir(DEFAULT_DIR[column])
      return
    }
    if (dir === DEFAULT_DIR[column]) {
      setDir(dir === "asc" ? "desc" : "asc")
      return
    }
    setSort(null)
  }

  const load = useCallback(
    async (silent = false) => {
      if (!silent) setJobs(null)
      const interviewedFilter = status === "rejected" && interviewed ? interviewed : undefined
      const result = await run(() => api.applied(status || undefined, interviewedFilter))
      if (result) setJobs(result.jobs)
    },
    [run, status, interviewed],
  )

  useLoader(load)

  async function openCard(job: Job) {
    setOpen(job)
    const result = await run(() => api.job(job.id))
    if (result) setOpen(result.job)
  }

  function patchOpen(next: Partial<Job>) {
    const id = open?.id
    setOpen((prev) => (prev ? { ...prev, ...next } : prev))
    if (!id) return
    setJobs((prev) => prev?.map((item) => (item.id === id ? { ...item, ...next } : item)) ?? null)
  }

  async function setPipeline(job: Job, next: JobStatus) {
    const result = await run(() => api.setJobStatus(job.id, next))
    if (!result) return
    const update = {
      status: result.status,
      applied_at: result.applied_at,
      interviewed_at: result.interviewed_at,
    }
    setOpen((prev) => (prev && prev.id === job.id ? { ...prev, ...update } : prev))
    setJobs(
      (prev) =>
        prev
          ?.map((item) => (item.id === job.id ? { ...item, ...update } : item))
          .filter((item) => {
            if (status === "applied") return item.status === "applied"
            if (status === "interview") return item.status === "interview" || Boolean(item.interviewed_at)
            if (status === "rejected") {
              if (item.status !== "rejected") return false
              if (interviewed === "yes") return Boolean(item.interviewed_at)
              if (interviewed === "no") return !item.interviewed_at
            }
            return true
          }) ?? null,
    )
    if (status === "applied" && result.status !== "applied") setOpen(null)
    if (status === "rejected" && result.status !== "rejected") setOpen(null)
    if (status === "interview" && result.status !== "interview" && !result.interviewed_at) setOpen(null)
  }

  if (composing) {
    return (
      <>
        <div className="row">
          <button className="btn btn-ghost btn-sm" onClick={() => setComposing(false)}>
            ← К списку
          </button>
        </div>
        <ManualJobForm
          onCancel={() => setComposing(false)}
          onCreated={(job) => {
            setComposing(false)
            setJobs((prev) => [job, ...(prev ?? []).filter((item) => item.id !== job.id)])
            setOpen(job)
          }}
        />
      </>
    )
  }

  if (open) {
    return (
      <JobCard
        job={open}
        onBack={() => setOpen(null)}
        onPatch={patchOpen}
        onJob={(next) => {
          setJobs((prev) => prev?.map((item) => (item.id === open.id ? { ...item, ...next } : item)) ?? null)
          setOpen(next)
        }}
      >
        <div className="row">
          <button className="btn btn-sm" onClick={() => onOpenCompany(open)}>
            Все вакансии {open.company}
          </button>
          {PIPE_ACTIONS.map((action) => (
            <button
              key={action.status}
              className={`btn btn-sm ${open.status === action.status ? "btn-primary" : ""}`}
              onClick={() => void setPipeline(open, action.status)}
            >
              {action.label}
            </button>
          ))}
        </div>
      </JobCard>
    )
  }

  return (
    <>
      <div className="row">
        {PIPE.map((item) => (
          <button
            key={item.id || "all"}
            className={`btn btn-sm ${status === item.id ? "btn-primary" : "btn-ghost"}`}
            onClick={() => setStatus(item.id)}
          >
            {item.label}
          </button>
        ))}
        {status === "rejected" ? (
          <select
            className="select select-inline"
            aria-label="Собес"
            value={interviewed}
            onChange={(event) => setInterviewed(event.target.value as InterviewedFilter)}
          >
            <option value="">Все</option>
            <option value="yes">Был собес</option>
            <option value="no">Без собеса</option>
          </select>
        ) : null}
        <button className="btn btn-primary btn-sm" onClick={() => setComposing(true)}>
          Добавить вакансию
        </button>
      </div>

      {rows?.length ? <Count shown={rows.length} forms={["отклик", "отклика", "откликов"]} /> : null}

      {rows === null ? (
        <Skeletons />
      ) : rows.length === 0 ? (
        <Empty
          title="Пока пусто"
          hint="Отметьте «Подался» в списке вакансий или добавьте позицию вручную, если её нет на ATS."
        />
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <SortHeader column="title" label="Вакансия" sort={sort} dir={dir} onSort={sortBy} />
                <SortHeader column="company" label="Компания" sort={sort} dir={dir} onSort={sortBy} className="col-company" />
                <SortHeader column="score" label="Score" sort={sort} dir={dir} onSort={sortBy} className="col-score" />
                <SortHeader column="posted" label="Опубликована" sort={sort} dir={dir} onSort={sortBy} className="col-date" />
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
                <SortHeader
                  column="applied"
                  label="Подался"
                  sort={sort}
                  dir={dir}
                  onSort={sortBy}
                  className="col-date"
                  title="Когда вы отметили отклик"
                />
                <SortHeader column="status" label="Статус" sort={sort} dir={dir} onSort={sortBy} />
                {status === "rejected" ? (
                  <th className="col-check" title="До отказа было собеседование">
                    Собес
                  </th>
                ) : null}
                <th className="col-more" />
              </tr>
            </thead>
            <tbody>
              {rows.map((job) => (
                <tr key={job.id}>
                  <td>
                    <a href={job.url} target="_blank" rel="noreferrer">
                      {job.title}
                    </a>
                    {job.location ? <div className="cell-sub">{job.location}</div> : null}
                    {formatSalary(job.salary_min, job.salary_max, job.salary_currency) ? (
                      <div className="cell-sub">{formatSalary(job.salary_min, job.salary_max, job.salary_currency)}</div>
                    ) : null}
                  </td>
                  <td className="col-company">
                    <button
                      type="button"
                      className="cell-link"
                      title={`Все вакансии ${job.company}`}
                      onClick={() => onOpenCompany(job)}
                    >
                      {job.company}
                    </button>
                  </td>
                  <td className="col-score">
                    <ScoreBadge score={job.score} />
                  </td>
                  <td className="col-date">
                    <Age value={job.posted_at ?? job.first_seen_at} />
                  </td>
                  <td className="col-date">
                    <Age value={job.first_seen_at} warnAfter={14} />
                  </td>
                  <td className="col-date">
                    <Age value={job.changed_at ?? job.first_seen_at} warnAfter={14} />
                  </td>
                  <td className="col-date">
                    <Age value={job.applied_at} warnAfter={14} />
                  </td>
                  <td>
                    <span className="badge badge-neutral badge-cell">{pipeLabel(job.status)}</span>
                  </td>
                  {status === "rejected" ? (
                    <td className="col-check">
                      <input
                        type="checkbox"
                        className="checkbox"
                        checked={Boolean(job.interviewed_at)}
                        readOnly
                        tabIndex={-1}
                        aria-label={job.interviewed_at ? `Был собес: ${job.title}` : `Собеса не было: ${job.title}`}
                        onClick={(event) => event.preventDefault()}
                      />
                    </td>
                  ) : null}
                  <td className="col-more">
                    <button className="btn btn-ghost btn-sm" onClick={() => void openCard(job)}>
                      Карточка
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}
