import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from "react"

import { api } from "../api"
import { useAction } from "../app-context"
import { Age, Field, ScoreBadge, formatDate, formatSalary } from "./common"
import { DocumentIcon } from "./icons"
import type { Job, JobDuplicate } from "../types"

/**
 * Rows open the card on double click. Checkboxes, links and buttons inside the
 * row keep their own meaning, so a double click that lands on them is ignored.
 */
export function openOnDoubleClick(open: () => void) {
  return (event: MouseEvent<HTMLElement>) => {
    if ((event.target as HTMLElement).closest("a, button, input, select, textarea, label")) return
    window.getSelection()?.removeAllRanges()
    open()
  }
}

function listScore(job: Job): number | null {
  return job.status === "off_profile" ? null : job.score
}

function SideList({ jobs, activeId, onSelect }: { jobs: Job[]; activeId: string; onSelect: (job: Job) => void }) {
  const active = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    active.current?.scrollIntoView({ block: "nearest" })
  }, [activeId])

  return (
    <nav className="job-side" aria-label="Вакансии из списка">
      {jobs.map((item) => (
        <button
          key={item.id}
          type="button"
          ref={item.id === activeId ? active : undefined}
          className={`job-side-item ${item.id === activeId ? "is-active" : ""}`.trim()}
          aria-current={item.id === activeId ? "true" : undefined}
          onClick={() => onSelect(item)}
        >
          <span className="job-side-text">
            <span className="job-side-title">{item.title}</span>
            <span className="job-side-company">{item.company}</span>
          </span>
          <ScoreBadge score={listScore(item)} />
        </button>
      ))}
    </nav>
  )
}

function ClaudeComment({ text }: { text: string | null | undefined }) {
  return (
    <div className="claude-comment">
      <span className="field-label">Комментарий Claude</span>
      {text ? (
        <div className="claude-comment-body">{text}</div>
      ) : (
        <p className="muted claude-comment-empty">Пока нет</p>
      )}
    </div>
  )
}

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
    <div className="job-notes-own">
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
    </div>
  )
}

function Duplicates({ job, onJob }: { job: Job; onJob?: (job: Job) => void }) {
  const run = useAction()
  const [busy, setBusy] = useState<string | null>(null)
  const listings = job.duplicates ?? []
  if (listings.length < 2) return null

  async function pick(item: JobDuplicate) {
    if (item.primary || busy) return
    setBusy(item.id)
    const result = await run(() => api.setJobPrimary(item.id))
    setBusy(null)
    if (result) onJob?.(result.job)
  }

  return (
    <div className="job-dupes">
      <p className="job-dupes-title">Другие объявления</p>
      <p className="job-dupes-hint">Одна и та же вакансия на разных досках. Галочка — какую показывать в списке.</p>
      {listings.map((item) => (
        <label key={item.id} className="job-dupe">
          <input
            type="checkbox"
            className="checkbox"
            checked={item.primary}
            disabled={Boolean(busy)}
            aria-label={`Показывать в списке: ${item.source_label}`}
            onChange={() => void pick(item)}
          />
          <span className="job-dupe-body">
            <a href={item.url} target="_blank" rel="noreferrer">
              {item.title}
            </a>
            <div className="cell-sub">
              {item.company} · {item.source_label}
            </div>
          </span>
        </label>
      ))}
    </div>
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
  onJob,
  scoreExtra,
  list,
  onSelect,
  children,
}: {
  job: Job
  onBack: () => void
  onPatch: (next: Partial<Job>) => void
  /** When the person picks a different listing as primary, the whole card is that job. */
  onJob?: (job: Job) => void
  /** Rendered next to the score, for the recount button on the job list. */
  scoreExtra?: ReactNode
  /** The list the card was opened from, shown on the left to hop between jobs. */
  list?: Job[] | null
  onSelect?: (job: Job) => void
  children?: ReactNode
}) {
  const pay = formatSalary(job.salary_min, job.salary_max, job.salary_currency)
  const side = list && onSelect && list.length > 0 ? list : null
  return (
    <>
      <div className="row">
        <button className="btn btn-ghost btn-sm" onClick={onBack}>
          ← К списку
        </button>
      </div>
      <div className={side ? "job-view" : undefined}>
        {side && onSelect ? <SideList jobs={side} activeId={job.id} onSelect={onSelect} /> : null}
        <article className="card job-view-main">
          <div className="card-head">
            <div>
              <h3 className="card-title card-title-row">
                <a href={job.url} target="_blank" rel="noreferrer">
                  {job.title}
                </a>
                {job.cv_url ? (
                  <a
                    className="icon-btn cv-link"
                    href={job.cv_url}
                    target="_blank"
                    rel="noreferrer"
                    title="Открыть CV"
                    aria-label="Открыть CV"
                  >
                    <DocumentIcon />
                  </a>
                ) : null}
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
            {job.interviewed_at ? <Meta label="Собес" value={job.interviewed_at} /> : null}
          </div>

          {children}

          {job.description ? (
            <div className="job-description">{job.description}</div>
          ) : (
            <p className="muted">Описание не сохранилось — его не было в источнике или его отсекли до скоринга.</p>
          )}

          <div className="job-notes">
            <Notes job={job} onSaved={(notes) => onPatch({ notes })} />
            <ClaudeComment text={job.claude_comment} />
          </div>
          <Duplicates job={job} onJob={onJob} />
        </article>
      </div>
    </>
  )
}
