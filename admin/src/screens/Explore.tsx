import { useCallback, useEffect, useMemo, useState } from "react"

import { api, UnauthorizedError } from "../api"
import { useAction, useApp } from "../app-context"
import { MultiSelect } from "../components/MultiSelect"
import { RunProgress, type RunState } from "../components/RunProgress"
import { SortHeader } from "../components/SortHeader"
import { Empty, ScoreBadge, Skeletons, plural } from "../components/common"
import type { ExploreBoard, ExploreCompany } from "../types"

const STORAGE_KEY = "jobradar.explore.providers"

const ATS_LABELS: Record<string, string> = {
  arbeitsagentur: "Arbeitsagentur",
  arbeitnow: "Arbeitnow",
  adzuna: "Adzuna",
  himalayas: "Himalayas",
  jobicy: "Jobicy",
  thehub: "TheHub",
  remoteok: "Remote OK",
  remotive: "Remotive",
  workingnomads: "Working Nomads",
  landingjobs: "Landing.jobs",
  wttj: "Welcome to the Jungle",
  weworkremotely: "We Work Remotely",
  getro: "Getro",
  consider: "Consider",
}

type SortKey = "company" | "jobs" | "score"

const DEFAULT_DIR: Record<SortKey, "asc" | "desc"> = {
  company: "asc",
  jobs: "desc",
  score: "desc",
}

function atsLabel(provider: string): string {
  return ATS_LABELS[provider] ?? provider
}

function readStored(): string[] {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : []
  } catch {
    return []
  }
}

export function Explore({ onOpenJobs }: { onOpenJobs: (company: { company_key: string }) => void }) {
  const run = useAction()
  const { notify, logout, refresh, touchSources, cycleRunning } = useApp()
  const [boards, setBoards] = useState<ExploreBoard[] | null>(null)
  const [selected, setSelected] = useState<string[]>(readStored)
  const [refreshBoards, setRefreshBoards] = useState(false)
  const [scan, setScan] = useState<RunState | null>(null)
  const [companies, setCompanies] = useState<ExploreCompany[] | null | undefined>(undefined)
  const [busy, setBusy] = useState<string | null>(null)
  const [query, setQuery] = useState("")
  const [sort, setSort] = useState<SortKey>("jobs")
  const [dir, setDir] = useState<"asc" | "desc">("desc")
  const [launching, setLaunching] = useState(false)

  const loadBoards = useCallback(async () => {
    const result = await run(() => api.exploreBoards())
    if (!result) return
    setBoards(result.boards)
    setSelected((prev) => {
      const allowed = new Set(result.boards.map((board) => board.provider))
      const next = prev.filter((item) => allowed.has(item))
      return next.length === prev.length ? prev : next
    })
  }, [run])

  useEffect(() => {
    void loadBoards()
  }, [loadBoards])

  useEffect(() => {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(selected))
  }, [selected])

  const options = useMemo(
    () =>
      (boards ?? []).map((board) => ({
        value: board.provider,
        label: atsLabel(board.provider),
        hint: String(board.jobs),
      })),
    [boards],
  )

  const runnable = useMemo(() => {
    if (!boards) return []
    const picked = new Set(selected)
    return boards
      .filter((board) => picked.has(board.provider))
      .flatMap((board) => board.sources)
      .filter((source) => source.enabled)
  }, [boards, selected])

  async function loadCompanies(providers: string[]) {
    const result = await run(() => api.explore(providers))
    if (result) setCompanies(result.companies)
  }

  async function launch() {
    if (selected.length === 0 || launching || cycleRunning) return
    setLaunching(true)
    setCompanies(null)
    try {
      if (refreshBoards && runnable.length > 0) {
        let found = 0
        let fresh = 0
        let failed = 0
        setScan({
          phase: "sources",
          done: 0,
          total: runnable.length,
          current: "",
          currentId: null,
          found: 0,
          fresh: 0,
          failed: 0,
        })
        for (const [index, source] of runnable.entries()) {
          setScan((prev) => prev && { ...prev, done: index, current: source.label, currentId: source.id })
          try {
            const result = await api.runSource(source.id, { score: false })
            found += result.run.jobs_found
            fresh += result.run.jobs_new
            if (!result.run.ok) failed += 1
          } catch (error) {
            if (error instanceof UnauthorizedError) throw error
            failed += 1
          }
          touchSources()
          setScan((prev) => prev && { ...prev, done: index + 1, found, fresh, failed })
        }
      }
      await loadCompanies(selected)
      await loadBoards()
      refresh()
    } catch (error) {
      if (error instanceof UnauthorizedError) logout()
      else notify(error instanceof Error ? error.message : String(error), "error")
      setCompanies((prev) => prev ?? [])
    } finally {
      setScan(null)
      setLaunching(false)
      setCompanies((prev) => (prev === null ? [] : prev))
    }
  }

  async function track(company: ExploreCompany) {
    setBusy(company.company_key)
    const result = await run(() => api.addExplore(company.company_key))
    setBusy(null)
    if (!result) return
    notify(
      result.added
        ? `${company.company} — отслеживаем через ${result.ats}`
        : `${company.company}: ATS не определился. Компанию покроют query-источники`,
      result.added ? "ok" : "error",
    )
    if (result.added) {
      setCompanies((prev) => prev?.filter((item) => item.company_key !== company.company_key) ?? prev)
      refresh()
    }
  }

  function sortBy(column: SortKey) {
    if (sort === column) {
      setDir((prev) => (prev === "asc" ? "desc" : "asc"))
      return
    }
    setSort(column)
    setDir(DEFAULT_DIR[column])
  }

  const rows = useMemo(() => {
    if (!companies) return []
    const needle = query.trim().toLowerCase()
    const filtered = needle
      ? companies.filter((item) => item.company.toLowerCase().includes(needle))
      : companies
    const sign = dir === "asc" ? 1 : -1
    return [...filtered].sort((a, b) => {
      let left: string | number = 0
      let right: string | number = 0
      if (sort === "company") {
        left = a.company.toLowerCase()
        right = b.company.toLowerCase()
      } else if (sort === "jobs") {
        left = a.jobs
        right = b.jobs
      } else {
        left = a.best_score ?? -1
        right = b.best_score ?? -1
      }
      if (left < right) return -1 * sign
      if (left > right) return 1 * sign
      return a.company.localeCompare(b.company)
    })
  }, [companies, query, sort, dir])

  return (
    <>
      <p className="muted">
        Дашборды вроде Himalayas и Getro уже содержат вакансии компаний, которых нет в источниках. Выберите ATS,
        нажмите «Запустить» — в списке останутся только те, кого ещё можно добавить отдельно.
      </p>

      <div className="filters">
        <MultiSelect label="ATS" options={options} selected={selected} onChange={setSelected} />
        <label className="check-inline">
          <input
            type="checkbox"
            className="checkbox"
            checked={refreshBoards}
            onChange={(event) => setRefreshBoards(event.target.checked)}
          />
          Сначала обновить доски
        </label>
        <button
          className="btn btn-primary btn-sm"
          disabled={selected.length === 0 || launching || cycleRunning || boards === null}
          onClick={() => void launch()}
        >
          {launching ? "Анализирую…" : "Запустить"}
        </button>
      </div>

      {scan ? <RunProgress state={scan} /> : null}

      {boards === null ? (
        <Skeletons />
      ) : boards.length === 0 ? (
        <Empty
          title="Нет дашбордов"
          hint="Query-источники (Himalayas, Getro, Arbeitsagentur…) появятся здесь, когда их добавят на вкладке Источники."
        />
      ) : companies === undefined ? (
        <Empty
          title="Выберите ATS и запустите"
          hint="Можно отметить несколько площадок сразу. Компании, которые уже есть в источниках, в список не попадут."
        />
      ) : companies === null ? (
        scan ? null : <Skeletons />
      ) : companies.length === 0 ? (
        <Empty
          title="Некого добавлять"
          hint={
            refreshBoards
              ? "Либо доски пустые, либо все найденные компании уже в источниках."
              : "Отметьте «Сначала обновить доски», если вакансии на этих ATS ещё не собраны."
          }
        />
      ) : (
        <>
          <div className="filters">
            <input
              className="input"
              placeholder="Поиск компании"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
          <p className="muted">
            {rows.length} {plural(rows.length, ["компания", "компании", "компаний"])}
            {rows.length !== companies.length ? ` из ${companies.length}` : ""}
            {" · "}уже в источниках скрыты
          </p>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <SortHeader column="company" label="Компания" sort={sort} dir={dir} onSort={sortBy} />
                  <SortHeader column="jobs" label="Вакансий" sort={sort} dir={dir} onSort={sortBy} className="col-score" />
                  <SortHeader column="score" label="Score" sort={sort} dir={dir} onSort={sortBy} className="col-score" />
                  <th>ATS</th>
                  <th className="col-actions" />
                </tr>
              </thead>
              <tbody>
                {rows.map((company) => (
                  <tr key={company.company_key} className={busy === company.company_key ? "is-busy" : ""}>
                    <td>
                      <div style={{ fontWeight: 600 }}>{company.company}</div>
                      {company.sample_url ? (
                        <div className="cell-sub">
                          <a href={company.sample_url} target="_blank" rel="noreferrer">
                            Вакансия →
                          </a>
                        </div>
                      ) : null}
                    </td>
                    <td className="col-score">{company.jobs}</td>
                    <td className="col-score">
                      <ScoreBadge score={company.best_score} />
                    </td>
                    <td>
                      <div className="row-tight" style={{ flexWrap: "wrap" }}>
                        {company.providers.split(",").map((provider) => (
                          <span key={provider} className="badge badge-neutral">
                            {atsLabel(provider.trim())}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="col-actions">
                      <div className="row">
                        {company.jobs > 0 ? (
                          <button className="btn btn-sm" onClick={() => onOpenJobs(company)}>
                            Вакансии
                          </button>
                        ) : null}
                        <button
                          className="btn btn-primary btn-sm"
                          disabled={busy === company.company_key || launching}
                          onClick={() => void track(company)}
                        >
                          Добавить
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  )
}
