import { useCallback, useEffect, useState } from "react"

import { api } from "../api"
import { useAction, useApp } from "../app-context"
import { Empty, Field, Skeletons, formatDate } from "../components/common"
import type { DetectResult, Source, Tier } from "../types"

const ATS_SUBDOMAINS = new Set(["jobs", "boards", "job-boards", "apply", "careers"])

function labelFromUrl(raw: string): string {
  try {
    const url = new URL(raw.startsWith("http") ? raw : `https://${raw}`)
    const parts = url.hostname.replace(/^www\./, "").split(".")
    const candidate = ATS_SUBDOMAINS.has(parts[0] ?? "") ? (parts[1] ?? parts[0]) : parts[0]
    const name = candidate ?? raw
    return name.charAt(0).toUpperCase() + name.slice(1)
  } catch {
    return raw
  }
}

type Pending = DetectResult & { url: string; label: string; tier: Tier }

export function Sources() {
  const run = useAction()
  const { notify } = useApp()
  const [sources, setSources] = useState<Source[] | null>(null)
  const [url, setUrl] = useState("")
  const [detecting, setDetecting] = useState(false)
  const [pending, setPending] = useState<Pending | null>(null)
  const [bulk, setBulk] = useState("")
  const [bulkBusy, setBulkBusy] = useState(false)

  const load = useCallback(async () => {
    const result = await run(() => api.sources())
    setSources(result?.sources ?? [])
  }, [run])

  useEffect(() => {
    void load()
  }, [load])

  async function detect() {
    if (!url.trim()) return
    setDetecting(true)
    setPending(null)
    const result = await run(() => api.detect(url.trim()))
    setDetecting(false)
    if (!result) return
    if (!result.ats || !result.token) {
      notify("ATS не определился. Компанию покроют query-источники.", "error")
      return
    }
    setPending({ ...result, url: url.trim(), label: labelFromUrl(url), tier: "watchlist" })
  }

  async function confirmAdd() {
    if (!pending?.ats || !pending.token) return
    const result = await run(
      () =>
        api.createSource({
          kind: "company",
          tier: pending.tier,
          label: pending.label.trim() || pending.url,
          provider: pending.ats as string,
          token: pending.token as string,
          careers_url: pending.url,
        }),
      `${pending.label} добавлена`,
    )
    if (!result) return
    setPending(null)
    setUrl("")
    await load()
  }

  async function runBulk() {
    const urls = bulk
      .split(/\s*[\n,]\s*/)
      .map((line) => line.trim())
      .filter(Boolean)
    if (urls.length === 0) return
    setBulkBusy(true)
    const result = await run(() => api.bulkDetect(urls))
    setBulkBusy(false)
    if (!result) return

    const found = result.results.filter((item) => item.ats && item.token)
    for (const item of found) {
      await run(() =>
        api.createSource({
          kind: "company",
          tier: "watchlist",
          label: labelFromUrl(item.url),
          provider: item.ats as string,
          token: item.token as string,
          careers_url: item.url,
        }),
      )
    }
    notify(`Определилось ${found.length} из ${result.results.length}, добавлены в watchlist`, "ok")
    setBulk("")
    await load()
  }

  async function toggle(source: Source) {
    const enabled = source.enabled ? 0 : 1
    const result = await run(() => api.updateSource(source.id, { enabled }))
    if (!result) return
    setSources((prev) => prev?.map((item) => (item.id === source.id ? { ...item, enabled } : item)) ?? null)
  }

  async function changeTier(source: Source, tier: Tier) {
    const result = await run(() => api.updateSource(source.id, { tier }))
    if (!result) return
    setSources((prev) => prev?.map((item) => (item.id === source.id ? { ...item, tier } : item)) ?? null)
  }

  async function runOne(source: Source) {
    const result = await run(() => api.runSource(source.id))
    if (!result) return
    notify(
      result.run.ok
        ? `${source.label}: найдено ${result.run.jobs_found}, новых ${result.run.jobs_new}`
        : `${source.label}: ${result.run.error ?? "ошибка"}`,
      result.run.ok ? "ok" : "error",
    )
    await load()
  }

  async function remove(source: Source) {
    if (!confirm(`Удалить «${source.label}»? История откликов сохранится.`)) return
    const result = await run(() => api.deleteSource(source.id), `${source.label} удалена`)
    if (!result) return
    await load()
  }

  return (
    <>
      <section className="card">
        <h3 className="card-title">Добавить компанию</h3>
        <p className="card-sub">Вставьте ссылку на карьерную страницу — определим ATS и проверим, что вакансии читаются.</p>
        <div className="row">
          <input
            className="input grow"
            placeholder="https://boards.greenhouse.io/company"
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") void detect()
            }}
          />
          <button className="btn btn-primary" disabled={detecting || !url.trim()} onClick={() => void detect()}>
            {detecting ? "Проверяю…" : "Проверить"}
          </button>
        </div>

        {pending ? (
          <div className="card" style={{ background: "var(--bg-elevated)" }}>
            <div className="row-tight" style={{ flexWrap: "wrap" }}>
              <span className="badge badge-accent">{pending.ats}</span>
              <span className="badge badge-positive">{pending.jobs_found} вакансий</span>
            </div>
            {pending.sample.length > 0 ? (
              <ul className="muted" style={{ margin: 0, paddingLeft: 18 }}>
                {pending.sample.map((title) => (
                  <li key={title}>{title}</li>
                ))}
              </ul>
            ) : null}
            <Field label="Название">
              <input
                className="input"
                value={pending.label}
                onChange={(event) => setPending({ ...pending, label: event.target.value })}
              />
            </Field>
            <Field label="Уровень">
              <select
                className="select"
                value={pending.tier}
                onChange={(event) => setPending({ ...pending, tier: event.target.value as Tier })}
              >
                <option value="watchlist">Watchlist — порог уведомления 55</option>
                <option value="discovery">Discovery — порог 70</option>
              </select>
            </Field>
            <div className="row">
              <button className="btn btn-primary btn-sm" onClick={() => void confirmAdd()}>
                Добавить
              </button>
              <button className="btn btn-ghost btn-sm" onClick={() => setPending(null)}>
                Отмена
              </button>
            </div>
          </div>
        ) : null}
      </section>

      <section className="card">
        <h3 className="card-title">Пачкой</h3>
        <p className="card-sub">По ссылке на строку. Всё, что определится, уедет в watchlist.</p>
        <textarea
          className="textarea"
          style={{ minHeight: 120 }}
          placeholder={"https://jobs.lever.co/company\nhttps://company.recruitee.com"}
          value={bulk}
          onChange={(event) => setBulk(event.target.value)}
        />
        <div className="row">
          <button className="btn btn-primary btn-sm" disabled={bulkBusy || !bulk.trim()} onClick={() => void runBulk()}>
            {bulkBusy ? "Проверяю…" : "Проверить и добавить"}
          </button>
        </div>
      </section>

      <h2 className="section-title">Источники</h2>

      {sources === null ? (
        <Skeletons />
      ) : sources.length === 0 ? (
        <Empty title="Источников нет" hint="Похоже, миграции ещё не накатились." />
      ) : (
        sources.map((source) => (
          <article key={source.id} className="card">
            <div className="card-head">
              <div>
                <h3 className="card-title">{source.label}</h3>
                <p className="card-sub">
                  {source.provider} · {source.kind === "query" ? "запрос" : "компания"} · активных{" "}
                  {source.active_jobs}
                </p>
              </div>
              {source.last_ok === null ? (
                <span className="badge badge-neutral">не запускался</span>
              ) : source.last_ok ? (
                <span className="badge badge-positive">ок</span>
              ) : (
                <span className="badge badge-negative">ошибка</span>
              )}
            </div>

            {source.last_error ? <p className="error-text">{source.last_error}</p> : null}
            <p className="muted">Последний прогон: {formatDate(source.last_run_at)}</p>

            <div className="row">
              <select
                className="select"
                style={{ width: "auto" }}
                value={source.tier}
                onChange={(event) => void changeTier(source, event.target.value as Tier)}
              >
                <option value="watchlist">watchlist</option>
                <option value="discovery">discovery</option>
              </select>
              <button className="btn btn-sm" onClick={() => void toggle(source)}>
                {source.enabled ? "Выключить" : "Включить"}
              </button>
              <button className="btn btn-sm" onClick={() => void runOne(source)}>
                Прогнать
              </button>
              <button className="btn btn-danger btn-sm" onClick={() => void remove(source)}>
                Удалить
              </button>
            </div>
          </article>
        ))
      )}
    </>
  )
}
