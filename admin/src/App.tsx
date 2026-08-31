import { useCallback, useEffect, useMemo, useRef, useState, type ComponentType } from "react"

import { api, forgetToken, getToken, UnauthorizedError, type JobFilters } from "./api"
import { AppProvider, type ToastKind } from "./app-context"
import { BriefcaseIcon, CompassIcon, PersonIcon, RadarIcon, StackIcon } from "./components/icons"
import { RunProgress, type RunState } from "./components/RunProgress"
import { Discovery } from "./screens/Discovery"
import { Explore } from "./screens/Explore"
import { Jobs } from "./screens/Jobs"
import { Profile } from "./screens/Profile"
import { Sources } from "./screens/Sources"
import { TokenGate } from "./screens/TokenGate"

type TabId = "discovery" | "explore" | "jobs" | "sources" | "profile"

const TABS: Array<{ id: TabId; label: string; icon: ComponentType<{ className?: string }> }> = [
  { id: "discovery", label: "Discovery", icon: RadarIcon },
  { id: "explore", label: "Исследовать", icon: CompassIcon },
  { id: "jobs", label: "Вакансии", icon: BriefcaseIcon },
  { id: "sources", label: "Источники", icon: StackIcon },
  { id: "profile", label: "Профиль", icon: PersonIcon },
]

type Toast = { message: string; kind: ToastKind }

/** Jobs per scoring request: three Gemini batches, small enough to feel live. */
const SCORE_CHUNK = 30

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

  const notify = useCallback((message: string, kind: ToastKind = "ok") => {
    setToast({ message, kind })
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setToast(null), 4000)
  }, [])

  const logout = useCallback(() => {
    forgetToken()
    setAuthorized(false)
  }, [])

  useEffect(() => () => window.clearTimeout(timer.current), [])

  function openCompanyJobs(company: { company_key: string }) {
    setPreset((prev) => ({
      filters: { companies: [company.company_key], min_score: 0, status: "any" },
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

  /**
   * The cycle is driven from here, one source at a time, so the page can say
   * where it is. Each step is its own request, which also keeps a long run from
   * spending a single worker's subrequest budget on everything at once.
   */
  async function runCycle() {
    setRunning(true)
    setRun({ phase: "sources", done: 0, total: 0, current: "", currentId: null, found: 0, fresh: 0, failed: 0 })
    try {
      const plan = await api.runPlan()
      let found = 0
      let fresh = 0
      let failed = 0
      setRun((prev) => prev && { ...prev, total: plan.sources.length })

      for (const [index, source] of plan.sources.entries()) {
        setRun((prev) => prev && { ...prev, done: index, current: source.label, currentId: source.id })
        try {
          const result = await api.runSource(source.id, { score: false })
          found += result.run.jobs_found
          fresh += result.run.jobs_new
          if (!result.run.ok) failed += 1
        } catch (error) {
          if (error instanceof UnauthorizedError) throw error
          failed += 1
        }
        setSourcesTick((n) => n + 1)
        setRun((prev) => prev && { ...prev, done: index + 1, found, fresh, failed })
      }

      let scored = 0
      setRun((prev) => prev && { ...prev, phase: "scoring", done: 0, total: 0, current: "", currentId: null })
      for (;;) {
        const step = await api.score(SCORE_CHUNK)
        scored += step.scored
        setRun((prev) => prev && { ...prev, done: scored, total: scored + step.remaining })
        if (step.remaining === 0 || step.scored === 0) break
      }

      setRun((prev) => prev && { ...prev, phase: "digest", done: 0, total: 0, current: "", currentId: null })
      const digest = await api.sendDigest()

      notify(
        `Источников ${plan.sources.length}, вакансий ${found} (новых ${fresh}), оценено ${scored}, отправлено ${digest.notified}`,
        "ok",
      )
    } catch (error) {
      if (error instanceof UnauthorizedError) logout()
      else notify(error instanceof Error ? error.message : String(error), "error")
    } finally {
      setRunning(false)
      setRun(null)
      setRefreshTick((n) => n + 1)
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
            <button className="btn btn-primary btn-sm" disabled={running} onClick={() => void runCycle()}>
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
          {tab === "sources" ? <Sources /> : null}
          {tab === "profile" ? <Profile /> : null}
        </main>

        {toast ? <div className={`toast toast-${toast.kind}`}>{toast.message}</div> : null}
      </div>
    </AppProvider>
  )
}
