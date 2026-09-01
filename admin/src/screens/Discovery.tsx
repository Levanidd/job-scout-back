import { useCallback, useEffect, useMemo, useState } from "react"

import { api } from "../api"
import { useAction, useApp } from "../app-context"
import { SortHeader } from "../components/SortHeader"
import { Age, Empty, ScoreBadge, Skeletons, plural } from "../components/common"
import type { DiscoveredCompany } from "../types"

type StateFilter = "" | "new" | "added" | "dismissed"
type SortKey = "company" | "jobs" | "score" | "seen" | "ats"

const STATE_LABELS: Record<DiscoveredCompany["state"], string> = {
  new: "новая",
  added: "в мониторинге",
  dismissed: "скрытая",
}

const STATE_BADGE: Record<DiscoveredCompany["state"], string> = {
  new: "badge-accent",
  added: "badge-positive",
  dismissed: "badge-neutral",
}

const DEFAULT_DIR: Record<SortKey, "asc" | "desc"> = {
  company: "asc",
  jobs: "desc",
  score: "desc",
  seen: "desc",
  ats: "asc",
}

function compare(a: DiscoveredCompany, b: DiscoveredCompany, sort: SortKey, dir: "asc" | "desc"): number {
  const sign = dir === "asc" ? 1 : -1
  let left: string | number = 0
  let right: string | number = 0
  if (sort === "company") {
    left = a.company.toLowerCase()
    right = b.company.toLowerCase()
  } else if (sort === "jobs") {
    left = a.jobs_open
    right = b.jobs_open
  } else if (sort === "score") {
    left = a.best_score ?? -1
    right = b.best_score ?? -1
  } else if (sort === "seen") {
    left = a.first_seen_at
    right = b.first_seen_at
  } else {
    left = (a.detected_ats ?? "").toLowerCase()
    right = (b.detected_ats ?? "").toLowerCase()
  }
  if (left < right) return -1 * sign
  if (left > right) return 1 * sign
  return a.company.localeCompare(b.company)
}

export function Discovery({ onOpenJobs }: { onOpenJobs: (company: DiscoveredCompany) => void }) {
  const run = useAction()
  const { notify, refreshTick, refresh } = useApp()
  const [companies, setCompanies] = useState<DiscoveredCompany[] | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [query, setQuery] = useState("")
  const [state, setState] = useState<StateFilter>("new")
  const [ats, setAts] = useState("")
  const [hasAts, setHasAts] = useState("")
  const [jobs, setJobs] = useState("")
  const [sort, setSort] = useState<SortKey>("score")
  const [dir, setDir] = useState<"asc" | "desc">("desc")

  const load = useCallback(async (silent = false) => {
    if (!silent) setCompanies(null)
    const result = await run(() => api.discovered())
    if (result) setCompanies(result.companies)
  }, [run])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (!refreshTick) return
    void load(true)
  }, [refreshTick, load])

  const providers = useMemo(() => {
    if (!companies) return []
    return [...new Set(companies.map((item) => item.detected_ats).filter((item): item is string => Boolean(item)))].sort()
  }, [companies])

  const rows = useMemo(() => {
    if (!companies) return []
    const needle = query.trim().toLowerCase()
    return companies
      .filter((item) => {
        if (state && item.state !== state) return false
        if (ats && item.detected_ats !== ats) return false
        if (hasAts === "yes" && !item.detected_ats) return false
        if (hasAts === "no" && item.detected_ats) return false
        if (jobs === "open" && item.jobs_open <= 0) return false
        if (jobs === "none" && item.jobs_open > 0) return false
        if (!needle) return true
        const hay = `${item.company} ${item.detected_ats ?? ""} ${item.careers_url ?? ""}`.toLowerCase()
        return hay.includes(needle)
      })
      .sort((a, b) => compare(a, b, sort, dir))
  }, [companies, query, state, ats, hasAts, jobs, sort, dir])

  function sortBy(column: SortKey) {
    if (sort === column) {
      setDir((prev) => (prev === "asc" ? "desc" : "asc"))
      return
    }
    setSort(column)
    setDir(DEFAULT_DIR[column])
  }

  async function track(company: DiscoveredCompany) {
    setBusy(company.company_key)
    const result = await run(() => api.addDiscovered(company.company_key))
    setBusy(null)
    if (!result) return
    notify(
      result.added
        ? `${company.company} — отслеживаем через ${result.ats}`
        : `${company.company}: ATS не определился, компания остаётся в query-источниках`,
      result.added ? "ok" : "error",
    )
    setCompanies(
      (prev) =>
        prev?.map((item) =>
          item.company_key === company.company_key
            ? { ...item, state: "added", detected_ats: result.ats ?? item.detected_ats }
            : item,
        ) ?? null,
    )
  }

  async function dismiss(company: DiscoveredCompany) {
    setBusy(company.company_key)
    const result = await run(() => api.dismissDiscovered(company.company_key))
    setBusy(null)
    if (!result) return
    setCompanies(
      (prev) =>
        prev?.map((item) => (item.company_key === company.company_key ? { ...item, state: "dismissed" } : item)) ?? null,
    )
  }

  return (
    <>
      <p className="muted">
        Компании из поисковых досок, которых ещё нет в источниках. Карточка есть, даже если все позиции «вне профиля» —
        в обычном списке вакансий их не видно. «Вакансии» открывает полный набор, «Отслеживать» подключает доску
        компании.
      </p>

      <div className="filters">
        <input
          className="input"
          placeholder="Поиск компании"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <select className="select" value={state} onChange={(event) => setState(event.target.value as StateFilter)}>
          <option value="">Все статусы</option>
          <option value="new">новые</option>
          <option value="added">в мониторинге</option>
          <option value="dismissed">скрытые</option>
        </select>
        <select className="select" value={ats} onChange={(event) => setAts(event.target.value)}>
          <option value="">Все ATS</option>
          {providers.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
        <select className="select" value={hasAts} onChange={(event) => setHasAts(event.target.value)}>
          <option value="">ATS любой</option>
          <option value="yes">ATS известен</option>
          <option value="no">ATS не найден</option>
        </select>
        <select className="select" value={jobs} onChange={(event) => setJobs(event.target.value)}>
          <option value="">Любые вакансии</option>
          <option value="open">есть открытые</option>
          <option value="none">без открытых</option>
        </select>
        <button className="btn btn-ghost btn-sm" onClick={() => refresh()}>
          Обновить
        </button>
      </div>

      {companies === null ? (
        <Skeletons />
      ) : companies.length === 0 ? (
        <Empty
          title="Пока пусто"
          hint="Компании появятся здесь после прогона query-источников — они собираются из вакансий, которых нет в watchlist."
        />
      ) : rows.length === 0 ? (
        <Empty title="Ничего не нашлось" hint="Сбросьте фильтры или поиск." />
      ) : (
        <>
          <p className="muted">
            {rows.length} {plural(rows.length, ["компания", "компании", "компаний"])}
            {rows.length !== companies.length ? ` из ${companies.length}` : ""}
          </p>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <SortHeader column="company" label="Компания" sort={sort} dir={dir} onSort={sortBy} />
                  <SortHeader column="jobs" label="Вакансий" sort={sort} dir={dir} onSort={sortBy} className="col-score" />
                  <SortHeader column="score" label="Score" sort={sort} dir={dir} onSort={sortBy} className="col-score" />
                  <SortHeader column="ats" label="ATS" sort={sort} dir={dir} onSort={sortBy} />
                  <th>Статус</th>
                  <SortHeader column="seen" label="Найдена" sort={sort} dir={dir} onSort={sortBy} className="col-date" />
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
                    <td className="col-score">
                      {company.jobs_open > 0 ? (
                        <button
                          type="button"
                          className="th-sort"
                          style={{ textTransform: "none", letterSpacing: 0, fontWeight: 600 }}
                          title="Вакансии этой компании"
                          onClick={() => onOpenJobs(company)}
                        >
                          {company.jobs_open}
                        </button>
                      ) : (
                        0
                      )}
                    </td>
                    <td className="col-score">
                      <ScoreBadge score={company.best_score} />
                    </td>
                    <td>
                      {company.detected_ats ? (
                        <span className="badge badge-accent">{company.detected_ats}</span>
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>
                    <td>
                      <span className={`badge ${STATE_BADGE[company.state]}`}>{STATE_LABELS[company.state]}</span>
                    </td>
                    <td className="col-date">
                      <Age value={company.first_seen_at} warnAfter={14} />
                    </td>
                    <td className="col-actions">
                      <div className="row-tight">
                        {company.jobs_open > 0 ? (
                          <button className="btn btn-sm" onClick={() => onOpenJobs(company)}>
                            Вакансии
                          </button>
                        ) : null}
                        {company.state === "new" ? (
                          <>
                            <button
                              className="btn btn-primary btn-sm"
                              disabled={busy === company.company_key}
                              onClick={() => void track(company)}
                            >
                              Отслеживать
                            </button>
                            <button
                              className="btn btn-ghost btn-sm"
                              disabled={busy === company.company_key}
                              onClick={() => void dismiss(company)}
                            >
                              Скрыть
                            </button>
                          </>
                        ) : null}
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
