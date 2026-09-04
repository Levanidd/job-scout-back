import { useCallback, useState } from "react"

import { api } from "../api"
import { useAction, useLoader } from "../app-context"
import { Empty, Skeletons, plural } from "../components/common"
import type { JobStats, StatsBucket } from "../types"

function pct(part: number, whole: number): string {
  if (!whole) return "—"
  const value = (part / whole) * 100
  const rounded = value >= 10 ? Math.round(value) : Math.round(value * 10) / 10
  return `${rounded}%`
}

function weekLabel(start: string): string {
  const date = new Date(`${start}T00:00:00Z`)
  return date.toLocaleDateString("ru-RU", { day: "numeric", month: "short", timeZone: "UTC" })
}

function monthLabel(start: string): string {
  const [year, month] = start.split("-").map(Number)
  const date = new Date(Date.UTC(year, month - 1, 1))
  return date.toLocaleDateString("ru-RU", { month: "short", year: "2-digit", timeZone: "UTC" })
}

function Kpi({
  label,
  value,
  hint,
  tone,
}: {
  label: string
  value: number
  hint: string
  tone?: "accent" | "positive"
}) {
  return (
    <article className={`card stat-card ${tone ? `stat-card-${tone}` : ""}`}>
      <span className="stat-label">{label}</span>
      <strong className="stat-value">{value}</strong>
      <span className="stat-hint">{hint}</span>
    </article>
  )
}

function Funnel({ stats }: { stats: JobStats }) {
  const max = Math.max(stats.found, 1)
  const steps = [
    { key: "found", label: "Найдено", value: stats.found, tone: "neutral" },
    { key: "viewed", label: "Просмотрено", value: stats.viewed, tone: "accent" },
    { key: "applied", label: "Подался", value: stats.applied, tone: "positive" },
  ] as const
  return (
    <div className="funnel" role="img" aria-label="Воронка: найдено, просмотрено, подался">
      {steps.map((step) => (
        <div key={step.key} className="funnel-row">
          <span className="funnel-label">{step.label}</span>
          <div className="funnel-track">
            <div
              className={`funnel-fill funnel-fill-${step.tone}`}
              style={{ width: step.value === 0 ? "0%" : `${Math.max(8, (step.value / max) * 100)}%` }}
            />
          </div>
          <span className="funnel-n">{step.value}</span>
        </div>
      ))}
    </div>
  )
}

function Chart({
  title,
  hint,
  rows,
  label,
}: {
  title: string
  hint: string
  rows: StatsBucket[]
  label: (start: string) => string
}) {
  const max = Math.max(1, ...rows.map((row) => row.total))
  const total = rows.reduce((sum, row) => sum + row.total, 0)
  return (
    <article className="card">
      <div className="card-head">
        <div>
          <h2 className="card-title">{title}</h2>
          <p className="card-sub">{hint}</p>
        </div>
        <span className="badge badge-neutral">{total} за период</span>
      </div>
      {total === 0 ? (
        <Empty title="Пока нет откликов" hint="Отметьте «Подался» на вакансии — столбики появятся здесь." />
      ) : (
        <div className="chart">
          <div className="chart-bars">
            {rows.map((row) => {
              const height = row.total === 0 ? 2 : Math.max(8, (row.total / max) * 100)
              const titleText = [
                label(row.start),
                row.total
                  ? `${row.total} ${plural(row.total, ["отклик", "отклика", "откликов"])}`
                  : "нет откликов",
                row.applied ? `в работе ${row.applied}` : null,
                row.interview ? `интервью ${row.interview}` : null,
                row.rejected ? `отказ ${row.rejected}` : null,
              ]
                .filter(Boolean)
                .join(" · ")
              return (
                <div key={row.start} className="chart-col" title={titleText}>
                  <span className="chart-n">{row.total || ""}</span>
                  <div className="chart-plot">
                    <div className="chart-stack" style={{ height: `${height}%` }}>
                      {row.applied > 0 ? (
                        <div className="chart-seg chart-seg-applied" style={{ flexGrow: row.applied }} />
                      ) : null}
                      {row.interview > 0 ? (
                        <div className="chart-seg chart-seg-interview" style={{ flexGrow: row.interview }} />
                      ) : null}
                      {row.rejected > 0 ? (
                        <div className="chart-seg chart-seg-rejected" style={{ flexGrow: row.rejected }} />
                      ) : null}
                      {row.total === 0 ? <div className="chart-seg chart-seg-empty" /> : null}
                    </div>
                  </div>
                  <span className="chart-label">{label(row.start)}</span>
                </div>
              )
            })}
          </div>
          <div className="chart-legend">
            <span>
              <i className="chart-dot chart-seg-applied" />в работе
            </span>
            <span>
              <i className="chart-dot chart-seg-interview" />интервью
            </span>
            <span>
              <i className="chart-dot chart-seg-rejected" />отказ
            </span>
          </div>
        </div>
      )}
    </article>
  )
}

export function Stats() {
  const run = useAction()
  const [stats, setStats] = useState<JobStats | null>(null)

  const load = useCallback(
    async (silent = false) => {
      if (!silent) setStats(null)
      const result = await run(() => api.stats())
      if (result) setStats(result)
    },
    [run],
  )

  useLoader(load)

  if (stats === null) return <Skeletons count={4} />

  const answered = stats.pipeline.interview + stats.pipeline.rejected
  const weekTotal = stats.weeks.reduce((sum, row) => sum + row.total, 0)

  return (
    <>
      <div className="stats-kpis">
        <Kpi
          label="Найдено"
          value={stats.found}
          hint={stats.open === stats.found ? "все ещё открыты" : `открытых сейчас ${stats.open}`}
        />
        <Kpi
          label="Просмотрено"
          value={stats.viewed}
          hint={`${pct(stats.viewed, stats.found)} от найденных`}
          tone="accent"
        />
        <Kpi
          label="Подался"
          value={stats.applied}
          hint={
            stats.viewed > 0 && stats.applied <= stats.viewed
              ? `${pct(stats.applied, stats.viewed)} от просмотренных · ${pct(stats.applied, stats.found)} от найденных`
              : `${pct(stats.applied, stats.found)} от найденных`
          }
          tone="positive"
        />
      </div>

      <article className="card">
        <div className="card-head">
          <div>
            <h2 className="card-title">Воронка</h2>
            <p className="card-sub">
              {stats.later > 0 ? `Отложено «посмотреть позже»: ${stats.later}. ` : ""}
              Чёрный список в цифры не входит.
            </p>
          </div>
        </div>
        <Funnel stats={stats} />
      </article>

      <article className="card">
        <div className="card-head">
          <div>
            <h2 className="card-title">Подался подробнее</h2>
            <p className="card-sub">
              {stats.applied
                ? `Исход есть у ${pct(answered, stats.applied)} откликов${weekTotal ? ` · за 12 недель ${weekTotal}` : ""}`
                : "Отметьте «Подался» — разбивка и диаграммы появятся здесь."}
            </p>
          </div>
        </div>
        <div className="stats-kpis stats-kpis-pipeline">
          <Kpi label="В работе" value={stats.pipeline.waiting} hint="ещё без интервью и отказа" />
          <Kpi
            label="Интервью"
            value={stats.pipeline.interview}
            hint={stats.applied ? `${pct(stats.pipeline.interview, stats.applied)} от откликов` : "появятся после откликов"}
            tone="positive"
          />
          <Kpi
            label="Отказ"
            value={stats.pipeline.rejected}
            hint={stats.applied ? `${pct(stats.pipeline.rejected, stats.applied)} от откликов` : "появятся после откликов"}
          />
        </div>
      </article>

      <Chart
        title="Подача по неделям"
        hint="Неделя с понедельника. Последние 12 недель."
        rows={stats.weeks}
        label={weekLabel}
      />
      <Chart
        title="Подача по месяцам"
        hint="Календарный месяц. Последние 12 месяцев."
        rows={stats.months}
        label={monthLabel}
      />

      {stats.companies.length > 0 ? (
        <article className="card">
          <h2 className="card-title">Куда подавался чаще</h2>
          <ul className="stat-companies">
            {stats.companies.map((item) => (
              <li key={item.company_key}>
                <span>{item.company}</span>
                <span className="stat-companies-n">{item.n}</span>
              </li>
            ))}
          </ul>
        </article>
      ) : null}
    </>
  )
}
