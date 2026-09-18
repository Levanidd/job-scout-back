import { useCallback, useState } from "react"

import { api } from "../api"
import { useAction, useLoader } from "../app-context"
import { oneOf, usePersistentState } from "../persist"
import { JobCard } from "../components/JobCard"
import { Age, Count, Empty, Field, ScoreBadge, Skeletons, formatSalary } from "../components/common"
import type { Job, JobStatus } from "../types"

function todayLocal(): string {
  const date = new Date()
  const pad = (value: number) => String(value).padStart(2, "0")
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

export type PipeFilter = "" | "applied" | "interview" | "rejected"

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
  applied: "подался",
  interview: "интервью",
  rejected: "отказ",
}

function pipeLabel(status: JobStatus): string {
  if (status === "applied" || status === "interview" || status === "rejected") return PIPE_LABELS[status]
  return status
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
  preset?: PipeFilter
  onOpenCompany: (company: { company_key: string }) => void
}) {
  const run = useAction()
  // A preset arrives from the Stats tab, where the user picked the bucket by
  // clicking a number — that pick should not become tomorrow's default view.
  const [status, setStatus] = usePersistentState<PipeFilter>(
    "applied.status",
    preset ?? "",
    oneOf("", "applied", "interview", "rejected"),
    { store: !preset },
  )
  const [jobs, setJobs] = useState<Job[] | null>(null)
  const [open, setOpen] = useState<Job | null>(null)
  const [composing, setComposing] = useState(false)

  const load = useCallback(
    async (silent = false) => {
      if (!silent) setJobs(null)
      const result = await run(() => api.applied(status || undefined))
      if (result) setJobs(result.jobs)
    },
    [run, status],
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
    const update = { status: result.status, applied_at: result.applied_at }
    setOpen((prev) => (prev && prev.id === job.id ? { ...prev, ...update } : prev))
    setJobs(
      (prev) =>
        prev
          ?.map((item) => (item.id === job.id ? { ...item, ...update } : item))
          .filter((item) => !status || item.status === status) ?? null,
    )
    if (status && result.status !== status) setOpen(null)
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
      <JobCard job={open} onBack={() => setOpen(null)} onPatch={patchOpen}>
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
        <button className="btn btn-primary btn-sm" onClick={() => setComposing(true)}>
          Добавить вакансию
        </button>
      </div>

      {jobs?.length ? <Count shown={jobs.length} forms={["отклик", "отклика", "откликов"]} /> : null}

      {jobs === null ? (
        <Skeletons />
      ) : jobs.length === 0 ? (
        <Empty
          title="Пока пусто"
          hint="Отметьте «Подался» в списке вакансий или добавьте позицию вручную, если её нет на ATS."
        />
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Вакансия</th>
                <th className="col-company">Компания</th>
                <th className="col-score">Score</th>
                <th className="col-date">Опубликована</th>
                <th className="col-date" title="Когда мы впервые увидели вакансию">
                  Добавлена
                </th>
                <th className="col-date" title="Когда вакансия изменилась у источника">
                  Обновлена
                </th>
                <th className="col-date" title="Когда вы отметили отклик">
                  Подался
                </th>
                <th>Статус</th>
                <th className="col-more" />
              </tr>
            </thead>
            <tbody>
              {jobs.map((job) => (
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
