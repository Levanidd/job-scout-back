import { useCallback, useEffect, useState } from "react"

import { api } from "../api"
import { useAction, useApp } from "../app-context"
import { Empty, ScoreBadge, Skeletons, formatDate } from "../components/common"
import type { DiscoveredCompany } from "../types"

const STATES = [
  { id: "new", label: "Новые" },
  { id: "added", label: "В мониторинге" },
  { id: "dismissed", label: "Скрытые" },
]

export function Discovery() {
  const run = useAction()
  const { notify } = useApp()
  const [state, setState] = useState("new")
  const [companies, setCompanies] = useState<DiscoveredCompany[] | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  const load = useCallback(async () => {
    setCompanies(null)
    const result = await run(() => api.discovered(state))
    setCompanies(result?.companies ?? [])
  }, [run, state])

  useEffect(() => {
    void load()
  }, [load])

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
      </div>

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
                  {company.hits} релевантных вакансий · с {formatDate(company.first_seen_at)}
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

            {state === "new" ? (
              <div className="row">
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
              </div>
            ) : null}
          </article>
        ))
      )}
    </>
  )
}
