import { useCallback, useEffect, useMemo, useRef, useState, type ComponentType } from "react"

import { api, forgetToken, getToken, UnauthorizedError, type JobFilters } from "./api"
import { AppProvider, type ToastKind } from "./app-context"
import { BookIcon, BriefcaseIcon, ChartIcon, CheckIcon, PeopleIcon, PersonIcon, StackIcon } from "./components/icons"
import { RunProgress, type RunState } from "./components/RunProgress"
import { Applied } from "./screens/Applied"
import { Guide } from "./screens/Guide"
import { Jobs } from "./screens/Jobs"
import { Profile } from "./screens/Profile"
import { Resources } from "./screens/Resources"
import { Stats } from "./screens/Stats"
import { TokenGate } from "./screens/TokenGate"
import { Users } from "./screens/Users"
import type { AuthUser, Cycle } from "./types"

type TabId = "resources" | "jobs" | "applied" | "stats" | "profile" | "users" | "guide"

const TABS: Array<{ id: TabId; label: string; icon: ComponentType<{ className?: string }>; master?: boolean }> = [
  { id: "resources", label: "Ресурсы", icon: StackIcon },
  { id: "jobs", label: "Вакансии", icon: BriefcaseIcon },
  { id: "applied", label: "Подался", icon: CheckIcon },
  { id: "stats", label: "Статистика", icon: ChartIcon },
  { id: "users", label: "Пользователи", icon: PeopleIcon, master: true },
  { id: "profile", label: "Профиль", icon: PersonIcon },
  { id: "guide", label: "Инструкция", icon: BookIcon },
]

type Toast = { message: string; kind: ToastKind }

function toRunState(cycle: Cycle): RunState {
  return {
    phase: cycle.phase,
    done: cycle.done,
    total: cycle.total,
    current: cycle.current,
    currentId: cycle.current_id,
    found: cycle.found,
    fresh: cycle.fresh,
    failed: cycle.failed,
  }
}

function doneMessage(cycle: Cycle): string {
  if (cycle.source_total === 0) {
    return cycle.scored || cycle.notified
      ? `Источники за последние 3 часа уже пройдены. Оценено ${cycle.scored}, отправлено ${cycle.notified}`
      : "Источники за последние 3 часа уже пройдены. Повторный обход — позже или по кнопке на карточке источника."
  }
  return `Источников ${cycle.source_total}, вакансий ${cycle.found} (новых ${cycle.fresh}), оценено ${cycle.scored}, отправлено ${cycle.notified}`
}

export default function App() {
  const [authorized, setAuthorized] = useState(() => Boolean(getToken()))
  const [me, setMe] = useState<AuthUser | null>(null)
  const [tab, setTab] = useState<TabId>("resources")
  // Opening a company from Discovery remounts the job list with its own
  // filters; picking the tab by hand always starts from the default view.
  const [preset, setPreset] = useState<{ filters: JobFilters; seq: number } | null>(null)
  const [toast, setToast] = useState<Toast | null>(null)
  const [running, setRunning] = useState(false)
  const [run, setRun] = useState<RunState | null>(null)
  const [refreshTick, setRefreshTick] = useState(0)
  const [sourcesTick, setSourcesTick] = useState(0)
  const timer = useRef<number | undefined>(undefined)
  const seenRunning = useRef(false)
  const lastSourceDone = useRef(-1)

  const notify = useCallback((message: string, kind: ToastKind = "ok") => {
    setToast({ message, kind })
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setToast(null), 4000)
  }, [])

  const logout = useCallback(() => {
    forgetToken()
    setMe(null)
    setAuthorized(false)
  }, [])

  const finishCycle = useCallback(
    (cycle: Cycle) => {
      const watched = seenRunning.current
      seenRunning.current = false
      setRunning(false)
      setRun(null)
      if (watched && cycle.status === "done") {
        notify(doneMessage(cycle), "ok")
        setRefreshTick((n) => n + 1)
        setSourcesTick((n) => n + 1)
      } else if (watched && cycle.status === "error") {
        notify(cycle.error || "Прогон оборвался", "error")
      }
    },
    [notify],
  )

  const applyCycle = useCallback(
    (cycle: Cycle) => {
      if (cycle.status === "running") {
        seenRunning.current = true
        setRunning(true)
        setRun(toRunState(cycle))
        if (cycle.phase === "sources" && cycle.done !== lastSourceDone.current) {
          lastSourceDone.current = cycle.done
          setSourcesTick((n) => n + 1)
        }
        return
      }
      finishCycle(cycle)
    },
    [finishCycle],
  )

  useEffect(() => () => window.clearTimeout(timer.current), [])

  useEffect(() => {
    if (!authorized) return
    void (async () => {
      try {
        const [user, cycle] = await Promise.all([api.me(), api.cycle()])
        setMe(user)
        applyCycle(cycle)
      } catch (error) {
        if (error instanceof UnauthorizedError) logout()
      }
    })()
  }, [authorized, applyCycle, logout])

  useEffect(() => {
    if (!authorized || !running) return
    const id = window.setInterval(() => {
      void (async () => {
        try {
          const cycle = await api.cycle()
          applyCycle(cycle)
        } catch (error) {
          if (error instanceof UnauthorizedError) logout()
        }
      })()
    }, 1500)
    return () => window.clearInterval(id)
  }, [authorized, running, applyCycle, logout])

  function openCompanyJobs(company: { company_key: string }) {
    setPreset((prev) => ({
      filters: { companies: [company.company_key], min_score: 0, status: "any" },
      seq: (prev?.seq ?? 0) + 1,
    }))
    setTab("jobs")
  }

  function openSourceJobs(source: { id: number; label: string }) {
    setPreset((prev) => ({
      filters: { source_id: source.id, source_label: source.label, min_score: 0, status: "any" },
      seq: (prev?.seq ?? 0) + 1,
    }))
    setTab("jobs")
  }

  const context = useMemo(
    () => ({
      me,
      notify,
      logout,
      refreshTick,
      refresh: () => setRefreshTick((n) => n + 1),
      sourcesTick,
      touchSources: () => setSourcesTick((n) => n + 1),
      runningSourceId: run?.currentId ?? null,
      cycleRunning: running,
    }),
    [me, notify, logout, refreshTick, sourcesTick, run?.currentId, running],
  )

  async function startCycle() {
    try {
      lastSourceDone.current = -1
      applyCycle(await api.startCycle())
    } catch (error) {
      if (error instanceof UnauthorizedError) logout()
      else notify(error instanceof Error ? error.message : String(error), "error")
    }
  }

  if (!authorized) {
    return <TokenGate onAuthorized={() => setAuthorized(true)} />
  }

  return (
    <AppProvider value={context}>
      <div className="app">
        <header className="header">
          <h1>JobRadar</h1>
          <div className="header-actions">
            {me ? <span className="muted">{me.name}</span> : null}
            <button
              className="btn btn-primary btn-sm"
              disabled={running}
              title="Идёт на сервере. Пропускает доски, которые успешно прошли за последние 3 часа"
              onClick={() => void startCycle()}
            >
              {running ? "Идёт прогон…" : "Прогнать"}
            </button>
            <button className="btn btn-ghost btn-sm" onClick={() => setRefreshTick((n) => n + 1)}>
              Обновить
            </button>
            <button className="btn btn-ghost btn-sm" onClick={logout}>
              Выйти
            </button>
          </div>
        </header>

        <nav className="tabs">
          {TABS.filter((item) => !item.master || me?.role === "master").map((item) => {
            const Icon = item.icon
            return (
              <button
                key={item.id}
                className="tab"
                aria-current={tab === item.id ? "page" : undefined}
                onClick={() => {
                  if (item.id === "jobs") setPreset(null)
                  setTab(item.id)
                }}
              >
                <Icon />
                {item.label}
              </button>
            )
          })}
        </nav>

        <main className="content">
          {run ? <RunProgress state={run} /> : null}
          {tab === "resources" ? (
            <Resources onOpenCompanyJobs={openCompanyJobs} onOpenSourceJobs={openSourceJobs} />
          ) : null}
          {tab === "jobs" ? <Jobs key={preset?.seq ?? "all"} preset={preset?.filters} /> : null}
          {tab === "applied" ? <Applied /> : null}
          {tab === "stats" ? <Stats /> : null}
          {tab === "users" && me?.role === "master" ? <Users /> : null}
          {tab === "profile" ? <Profile /> : null}
          {tab === "guide" ? <Guide /> : null}
        </main>

        {toast ? <div className={`toast toast-${toast.kind}`}>{toast.message}</div> : null}
      </div>
    </AppProvider>
  )
}
