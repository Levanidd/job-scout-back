import { useCallback, useEffect, useMemo, useRef, useState, type ComponentType } from "react"

import { api, forgetToken, getToken, UnauthorizedError, type JobFilters } from "./api"
import { AppProvider, type ToastKind } from "./app-context"
import { BriefcaseIcon, CheckIcon, CompassIcon, PersonIcon, RadarIcon, StackIcon } from "./components/icons"
import { RunProgress, type RunState } from "./components/RunProgress"
import { Applied } from "./screens/Applied"
import { Discovery } from "./screens/Discovery"
import { Explore } from "./screens/Explore"
import { Jobs } from "./screens/Jobs"
import { Profile } from "./screens/Profile"
import { Sources } from "./screens/Sources"
import { TokenGate } from "./screens/TokenGate"
import type { Cycle } from "./types"

type TabId = "discovery" | "explore" | "jobs" | "applied" | "sources" | "profile"

const TABS: Array<{ id: TabId; label: string; icon: ComponentType<{ className?: string }> }> = [
  { id: "discovery", label: "Discovery", icon: RadarIcon },
  { id: "explore", label: "Исследовать", icon: CompassIcon },
  { id: "jobs", label: "Вакансии", icon: BriefcaseIcon },
  { id: "applied", label: "Подался", icon: CheckIcon },
  { id: "sources", label: "Источники", icon: StackIcon },
  { id: "profile", label: "Профиль", icon: PersonIcon },
]

type Toast = { message: string; kind: ToastKind }

const STALE_MS = 150_000

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

function isStale(updatedAt: string | null): boolean {
  if (!updatedAt) return true
  const iso = updatedAt.includes("T") ? updatedAt : `${updatedAt.replace(" ", "T")}Z`
  const ms = Date.parse(iso)
  return Number.isNaN(ms) || Date.now() - ms > STALE_MS
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
  const [tab, setTab] = useState<TabId>("discovery")
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
        const cycle = await api.cycle()
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
          if (cycle.status === "running" && isStale(cycle.updated_at)) {
            applyCycle(await api.startCycle())
          }
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
      notify,
      logout,
      refreshTick,
      refresh: () => setRefreshTick((n) => n + 1),
      sourcesTick,
      touchSources: () => setSourcesTick((n) => n + 1),
      runningSourceId: run?.currentId ?? null,
      cycleRunning: running,
    }),
    [notify, logout, refreshTick, sourcesTick, run?.currentId, running],
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
          {TABS.map((item) => {
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
          {tab === "discovery" ? <Discovery onOpenJobs={openCompanyJobs} /> : null}
          {tab === "explore" ? <Explore onOpenJobs={openCompanyJobs} /> : null}
          {tab === "jobs" ? <Jobs key={preset?.seq ?? "all"} preset={preset?.filters} /> : null}
          {tab === "applied" ? <Applied /> : null}
          {tab === "sources" ? <Sources onOpenJobs={openSourceJobs} /> : null}
          {tab === "profile" ? <Profile /> : null}
        </main>

        {toast ? <div className={`toast toast-${toast.kind}`}>{toast.message}</div> : null}
      </div>
    </AppProvider>
  )
}
