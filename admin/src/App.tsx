import { useCallback, useEffect, useMemo, useRef, useState, type ComponentType } from "react"

import { api, forgetToken, getToken, UnauthorizedError, type JobFilters } from "./api"
import { AppProvider, type ToastKind } from "./app-context"
import { BriefcaseIcon, PersonIcon, RadarIcon, StackIcon } from "./components/icons"
import { Discovery } from "./screens/Discovery"
import { Jobs } from "./screens/Jobs"
import { Profile } from "./screens/Profile"
import { Sources } from "./screens/Sources"
import { TokenGate } from "./screens/TokenGate"
import type { DiscoveredCompany } from "./types"

type TabId = "discovery" | "jobs" | "sources" | "profile"

const TABS: Array<{ id: TabId; label: string; icon: ComponentType<{ className?: string }> }> = [
  { id: "discovery", label: "Discovery", icon: RadarIcon },
  { id: "jobs", label: "Вакансии", icon: BriefcaseIcon },
  { id: "sources", label: "Источники", icon: StackIcon },
  { id: "profile", label: "Профиль", icon: PersonIcon },
]

type Toast = { message: string; kind: ToastKind }

export default function App() {
  const [authorized, setAuthorized] = useState(() => Boolean(getToken()))
  const [tab, setTab] = useState<TabId>("discovery")
  // Opening a company from Discovery remounts the job list with its own
  // filters; picking the tab by hand always starts from the default view.
  const [preset, setPreset] = useState<{ filters: JobFilters; seq: number } | null>(null)
  const [toast, setToast] = useState<Toast | null>(null)
  const [running, setRunning] = useState(false)
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

  function openCompanyJobs(company: DiscoveredCompany) {
    setPreset((prev) => ({
      filters: { companies: [company.company_key], min_score: 0, status: "any" },
      seq: (prev?.seq ?? 0) + 1,
    }))
    setTab("jobs")
  }

  const context = useMemo(() => ({ notify, logout }), [notify, logout])

  async function runCycle() {
    setRunning(true)
    try {
      const result = await api.runCycle()
      notify(
        `Источников: ${result.runs.length}, оценено ${result.scored}, отправлено ${result.notified}`,
        "ok",
      )
    } catch (error) {
      if (error instanceof UnauthorizedError) logout()
      else notify(error instanceof Error ? error.message : String(error), "error")
    } finally {
      setRunning(false)
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
          {tab === "discovery" ? <Discovery onOpenJobs={openCompanyJobs} /> : null}
          {tab === "jobs" ? <Jobs key={preset?.seq ?? "all"} preset={preset?.filters} /> : null}
          {tab === "sources" ? <Sources /> : null}
          {tab === "profile" ? <Profile /> : null}
        </main>

        {toast ? <div className={`toast toast-${toast.kind}`}>{toast.message}</div> : null}
      </div>
    </AppProvider>
  )
}
