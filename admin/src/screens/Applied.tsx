import { useCallback, useEffect, useState } from "react"

import { api } from "../api"
import { useAction, useApp } from "../app-context"
import { Age, Empty, Field, ScoreBadge, Skeletons, formatDate } from "../components/common"
import type { Job, JobStatus } from "../types"

const PIPE: Array<{ id: "" | "applied" | "interview" | "rejected"; label: string }> = [
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

function Meta({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <span className="applied-meta-label">{label}</span>
      <Age value={value} />
      <div className="cell-sub">{formatDate(value)}</div>
    </div>
  )
}

function Notes({ job, onSaved }: { job: Job; onSaved: (notes: string) => void }) {
  const run = useAction()
  const [text, setText] = useState(job.notes ?? "")
  const saved = job.notes ?? ""
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    setText(job.notes ?? "")
  }, [job.id, job.notes])

  async function save() {
    setBusy(true)
    const result = await run(() => api.saveJobNotes(job.id, text))
    setBusy(false)
    if (result) onSaved(result.notes ?? "")
  }

  return (
    <>
      <Field label="Заметки">
        <textarea
          className="textarea textarea-notes"
          placeholder="С кем говорил, что отправил, следующие шаги…"
          value={text}
          onChange={(event) => setText(event.target.value)}
        />
      </Field>
      <button className="btn btn-sm" disabled={busy || text === saved} onClick={() => void save()}>
        {busy ? "Сохраняю…" : "Сохранить заметку"}
      </button>
    </>
  )
}

export function Applied() {
  const run = useAction()
  const { refreshTick, refresh } = useApp()
  const [status, setStatus] = useState<"" | "applied" | "interview" | "rejected">("")
  const [jobs, setJobs] = useState<Job[] | null>(null)

  const load = useCallback(
    async (silent = false) => {
      if (!silent) setJobs(null)
      const result = await run(() => api.applied(status || undefined))
      if (result) setJobs(result.jobs)
    },
    [run, status],
  )

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (!refreshTick) return
    void load(true)
  }, [refreshTick, load])

  async function setPipeline(job: Job, next: JobStatus) {
    const result = await run(() => api.setJobStatus(job.id, next))
    if (!result) return
    setJobs(
      (prev) =>
        prev
          ?.map((item) =>
            item.id === job.id ? { ...item, status: result.status, applied_at: result.applied_at } : item,
          )
          .filter((item) => !status || item.status === status) ?? null,
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
        <button className="btn btn-ghost btn-sm" onClick={() => refresh()}>
          Обновить
        </button>
      </div>

      {jobs === null ? (
        <Skeletons />
      ) : jobs.length === 0 ? (
        <Empty
          title="Пока пусто"
          hint="Отметьте «Подался» в списке вакансий — карточка появится здесь. Статус и заметки правятся на карточке."
        />
      ) : (
        jobs.map((job) => (
          <article key={job.id} className="card">
            <div className="card-head">
              <div>
                <h3 className="card-title">
                  <a href={job.url} target="_blank" rel="noreferrer">
                    {job.title}
                  </a>
                </h3>
                <p className="card-sub">
                  {job.company}
                  {job.location ? ` · ${job.location}` : ""}
                </p>
              </div>
              <ScoreBadge score={job.score} />
            </div>

            <div className="applied-meta">
              <Meta label="Опубликована" value={job.posted_at} />
              <Meta label="Добавлена" value={job.first_seen_at} />
              <Meta label="Обновлена" value={job.last_seen_at} />
              <Meta label="Подался" value={job.applied_at} />
            </div>

            <div className="row">
              {PIPE_ACTIONS.map((action) => (
                <button
                  key={action.status}
                  className={`btn btn-sm ${job.status === action.status ? "btn-primary" : ""}`}
                  onClick={() => void setPipeline(job, action.status)}
                >
                  {action.label}
                </button>
              ))}
            </div>

            {job.description ? (
              <div className="job-description">{job.description}</div>
            ) : (
              <p className="muted">Описание не сохранилось — его не было в источнике или его отсекли до скоринга.</p>
            )}

            <Notes
              job={job}
              onSaved={(notes) =>
                setJobs((prev) => prev?.map((item) => (item.id === job.id ? { ...item, notes } : item)) ?? null)
              }
            />
          </article>
        ))
      )}
    </>
  )
}
