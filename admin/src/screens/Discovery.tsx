import { useCallback, useEffect, useState } from "react"

import { api } from "../api"
import { useAction, useApp } from "../app-context"
import { Empty, ScoreBadge, Skeletons, formatDate, plural } from "../components/common"
import type { DiscoveredCompany } from "../types"

const STATES = [
  { id: "new", label: "Новые" },
  { id: "added", label: "В мониторинге" },
  { id: "dismissed", label: "Скрытые" },
]

export function Discovery({ onOpenJobs }: { onOpenJobs: (company: DiscoveredCompany) => void }) {
  const run = useAction()
  const { notify, refreshTick, refresh } = useApp()
  const [state, setState] = useState("new")
  const [companies, setCompanies] = useState<DiscoveredCompany[] | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  const load = useCallback(async (silent = false) => {
    if (!silent) setCompanies(null)
    const result = await run(() => api.discovered(state))
    if (result) setCompanies(result.companies)
  }, [run, state])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (!refreshTick) return
    void load(true)
  }, [refreshTick, load])

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
    setCompanies((prev) => prev?.filter((item) => item.company_key !== company.company_key) ?? null)
  }

  async function dismiss(company: DiscoveredCompany) {
    setBusy(company.company_key)
    const result = await run(() => api.dismissDiscovered(company.company_key))
    setBusy(null)
    if (!result) return
    setCompanies((prev) => prev?.filter((item) => item.company_key !== company.company_key) ?? null)
  }

  return (
    <>
      <div className="row">
        {STATES.map((item) => (
          <button
            key={item.id}
            className={`btn btn-sm ${state === item.id ? "btn-primary" : "btn-ghost"}`}
            onClick={() => setState(item.id)}
          >
            {item.label}
          </button>
        ))}
        <button className="btn btn-ghost btn-sm" onClick={() => refresh()}>
          Обновить
        </button>
      </div>

      {state === "new" ? (
        <p className="muted">
          Компании из поисковых досок, которых ещё нет в источниках. Карточка есть, даже если все позиции «вне
          профиля» — в обычном списке вакансий их не видно. «Все вакансии» открывает полный набор, «Отслеживать»
          подключает доску компании.
        </p>
      ) : null}

      {companies === null ? (
        <Skeletons />
      ) : companies.length === 0 ? (
        <Empty
          title="Пока пусто"
          hint={
            state === "new"
              ? "Компании появятся здесь после прогона query-источников — они собираются из вакансий, которых нет в watchlist."
              : undefined
          }
        />
      ) : (
        companies.map((company) => (
          <article key={company.company_key} className="card">
            <div className="card-head">
              <div>
                <h3 className="card-title">{company.company}</h3>
                <p className="card-sub">
                  {company.jobs_open} {plural(company.jobs_open, ["вакансия", "вакансии", "вакансий"])} у нас
                  {" · "}с {formatDate(company.first_seen_at)}
                </p>
              </div>
              <ScoreBadge score={company.best_score} />
            </div>

            {company.detected_ats ? <span className="badge badge-accent">{company.detected_ats}</span> : null}

            {company.sample_url ? (
              <a href={company.sample_url} target="_blank" rel="noreferrer">
                Лучшая вакансия →
              </a>
            ) : null}

            <div className="row">
              {company.jobs_open > 0 ? (
                <button className="btn btn-sm" onClick={() => onOpenJobs(company)}>
                  Все вакансии ({company.jobs_open})
                </button>
              ) : null}
              {state === "new" ? (
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
          </article>
        ))
      )}
    </>
  )
}
