import { useEffect, useState, type ReactNode } from "react"

import { api } from "../api"
import { useAction } from "../app-context"
import { Age, Field, ScoreBadge, formatDate, formatSalary } from "./common"
import type { Job } from "../types"

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

/**
 * The full view of one vacancy, shared by the job list and the applications
 * list. Each screen has its own idea of what can be done with the job, so the
 * actions arrive as children and sit between the dates and the description.
 */
export function JobCard({
  job,
  onBack,
  onPatch,
  scoreExtra,
  children,
}: {
  job: Job
  onBack: () => void
  onPatch: (next: Partial<Job>) => void
  /** Rendered next to the score, for the recount button on the job list. */
  scoreExtra?: ReactNode
  children?: ReactNode
}) {
  const pay = formatSalary(job.salary_min, job.salary_max, job.salary_currency)
  return (
    <>
      <div className="row">
        <button className="btn btn-ghost btn-sm" onClick={onBack}>
          ← К списку
        </button>
      </div>
      <article className="card">
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
              {pay ? ` · ${pay}` : ""}
            </p>
          </div>
          <div className="score-cell">
            <ScoreBadge score={job.score} />
            {scoreExtra}
          </div>
        </div>

        <div className="applied-meta">
          <Meta label="Опубликована" value={job.posted_at} />
          <Meta label="Добавлена" value={job.first_seen_at} />
          <Meta label="Обновлена" value={job.changed_at ?? job.first_seen_at} />
          <Meta label="Подался" value={job.applied_at} />
        </div>

        {children}

        {job.description ? (
          <div className="job-description">{job.description}</div>
        ) : (
          <p className="muted">Описание не сохранилось — его не было в источнике или его отсекли до скоринга.</p>
        )}

        <Notes job={job} onSaved={(notes) => onPatch({ notes })} />
      </article>
    </>
  )
}
