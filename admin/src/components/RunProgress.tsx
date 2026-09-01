export type RunPhase = "sources" | "scoring" | "digest"

export type RunState = {
  phase: RunPhase
  done: number
  total: number
  current: string
  currentId: number | null
  found: number
  fresh: number
  failed: number
}

const TITLES: Record<RunPhase, string> = {
  sources: "Обход источников",
  scoring: "Оценка вакансий",
  digest: "Отправка дайджеста",
}

const HINTS: Record<RunPhase, string> = {
  sources: "читаю доски — страницу можно закрыть",
  scoring: "модель читает описания — страницу можно закрыть",
  digest: "собираю сообщение в Telegram",
}

export function RunProgress({ state }: { state: RunState }) {
  const percent = state.total > 0 ? Math.min(100, Math.round((state.done / state.total) * 100)) : 0

  return (
    <article className="card">
      <div className="card-head">
        <div>
          <h3 className="card-title">{TITLES[state.phase]}</h3>
          <p className="card-sub">
            {state.total > 0 ? `${state.done} из ${state.total}` : HINTS[state.phase]}
            {state.current ? ` · ${state.current}` : ""}
          </p>
        </div>
        {state.total > 0 ? <span className="badge badge-accent">{percent}%</span> : null}
      </div>

      <div className={`progress-track ${state.total > 0 ? "" : "is-indeterminate"}`}>
        <div className="progress-fill" style={state.total > 0 ? { width: `${percent}%` } : undefined} />
      </div>

      <p className="muted">
        Вакансий {state.found}, из них новых {state.fresh}
        {state.failed > 0 ? ` · источников с ошибкой: ${state.failed}` : ""}
        {" · прогон на сервере, вкладку можно закрыть"}
      </p>
    </article>
  )
}
