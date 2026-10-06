import { useCallback, useState } from "react"

import { api } from "../api"
import { useAction, useLoader } from "../app-context"
import { Empty, parseDate } from "../components/common"
import type { AutoRunSchedule, CycleRunEntry, CycleRunLog, CycleStatus } from "../types"

const STATUS: Record<CycleStatus, { label: string; tone: string }> = {
  idle: { label: "Ожидает", tone: "neutral" },
  running: { label: "Идёт", tone: "accent" },
  done: { label: "Готово", tone: "positive" },
  error: { label: "Ошибка", tone: "negative" },
}

function sameList(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((item, index) => item === b[index])
}

export function AutoRunSettings() {
  const run = useAction()
  const [saved, setSaved] = useState<AutoRunSchedule | null>(null)
  const [enabled, setEnabled] = useState(false)
  const [times, setTimes] = useState<string[]>([])
  const [draft, setDraft] = useState("09:00")
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    const current = await run(() => api.autoRun())
    if (!current) return
    setSaved(current)
    setEnabled(current.enabled)
    setTimes(current.times)
  }, [run])

  useLoader(load)

  function add() {
    if (!draft || times.includes(draft)) return
    setTimes([...times, draft].sort())
  }

  async function save() {
    setBusy(true)
    const result = await run(() => api.saveAutoRun({ enabled, times }), "Расписание сохранено")
    setBusy(false)
    if (!result) return
    setSaved(result)
    setEnabled(result.enabled)
    setTimes(result.times)
  }

  if (!saved) return null

  const dirty = enabled !== saved.enabled || !sameList(times, saved.times)

  return (
    <section className="card">
      <h3 className="card-title">Автоматический прогон</h3>
      <p className="card-sub">
        Прогон стартует сам в указанное время по Берлину. Если в этот момент уже идёт прогон, слот пропускается.
      </p>

      <label className="check-inline">
        <input
          type="checkbox"
          className="checkbox"
          checked={enabled}
          disabled={busy}
          onChange={(event) => setEnabled(event.target.checked)}
        />
        Запускать автоматически
      </label>

      <div className="field">
        <span className="field-label">Время запуска</span>
        {times.length > 0 ? (
          <div className="tag-list">
            {times.map((time) => (
              <span key={time} className="tag tag-keep">
                {time}
                <button
                  type="button"
                  className="tag-remove"
                  disabled={busy}
                  aria-label={`Удалить ${time}`}
                  onClick={() => setTimes(times.filter((item) => item !== time))}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        ) : (
          <p className="muted">Время не задано</p>
        )}
        <div className="tag-add">
          <input
            className="input input-time"
            type="time"
            value={draft}
            disabled={busy}
            onChange={(event) => setDraft(event.target.value)}
          />
          <button className="btn btn-sm" type="button" disabled={busy || !draft || times.includes(draft)} onClick={add}>
            Добавить
          </button>
        </div>
      </div>

      {enabled && times.length === 0 ? <p className="error-text">Добавьте хотя бы одно время запуска.</p> : null}

      <div className="row">
        <button
          className="btn btn-primary btn-sm"
          disabled={busy || !dirty || (enabled && times.length === 0)}
          onClick={() => void save()}
        >
          {busy ? "Сохраняю…" : "Сохранить"}
        </button>
      </div>
    </section>
  )
}

function day(value: string | null): string {
  const date = parseDate(value)
  return date ? date.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" }) : "—"
}

function clock(value: string | null): string {
  const date = parseDate(value)
  return date ? date.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" }) : "—"
}

function finishedCell(entry: CycleRunEntry): string {
  if (!entry.finished_at) return "—"
  const time = clock(entry.finished_at)
  return day(entry.finished_at) === day(entry.started_at) ? time : `${day(entry.finished_at)}, ${time}`
}

function duration(entry: CycleRunEntry): string {
  const start = parseDate(entry.started_at)
  const end = parseDate(entry.finished_at)
  if (!start || !end) return "—"
  const seconds = Math.max(0, Math.round((end.getTime() - start.getTime()) / 1000))
  const minutes = Math.floor(seconds / 60)
  return minutes >= 60
    ? `${Math.floor(minutes / 60)} ч ${minutes % 60} мин`
    : minutes > 0
      ? `${minutes} мин`
      : `${seconds} с`
}

export function RunLog() {
  const run = useAction()
  const [page, setPage] = useState(1)
  const [log, setLog] = useState<CycleRunLog | null>(null)

  const load = useCallback(async () => {
    const result = await run(() => api.runLog(page))
    if (result) setLog(result)
  }, [run, page])

  useLoader(load)

  if (!log) return null

  const pages = Math.max(1, Math.ceil(log.total / log.page_size))

  return (
    <section className="card">
      <h3 className="card-title">Журнал прогонов</h3>
      <p className="card-sub">Все прогоны, новые сверху. Время показано по часовому поясу браузера.</p>

      {log.runs.length === 0 ? (
        <Empty title="Прогонов ещё не было" />
      ) : (
        <div className="table-wrap">
          <table className="table run-log">
            <thead>
              <tr>
                <th>Дата</th>
                <th>Начало</th>
                <th>Завершение</th>
                <th>Длительность</th>
                <th>Запуск</th>
                <th>Статус</th>
                <th>Найдено / новых</th>
              </tr>
            </thead>
            <tbody>
              {log.runs.map((entry) => {
                const status = STATUS[entry.status] ?? STATUS.idle
                return (
                  <tr key={entry.id}>
                    <td>{day(entry.started_at)}</td>
                    <td>{clock(entry.started_at)}</td>
                    <td>{finishedCell(entry)}</td>
                    <td>{duration(entry)}</td>
                    <td>
                      <span className={`badge ${entry.kind === "auto" ? "badge-accent" : "badge-neutral"}`}>
                        {entry.kind === "auto" ? "Авто" : "Ручной"}
                      </span>
                      {entry.kind === "manual" && entry.user_name ? (
                        <span className="muted"> · {entry.user_name}</span>
                      ) : null}
                    </td>
                    <td>
                      <span className={`badge badge-${status.tone}`} title={entry.error ?? undefined}>
                        {status.label}
                      </span>
                    </td>
                    <td>
                      {entry.found} / {entry.fresh}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {pages > 1 ? (
        <div className="row pager">
          <button className="btn btn-sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
            ← Назад
          </button>
          <span className="muted">
            Стр. {log.page} из {pages}
          </span>
          <button className="btn btn-sm" disabled={page >= pages} onClick={() => setPage(page + 1)}>
            Вперёд →
          </button>
        </div>
      ) : null}
    </section>
  )
}
