import { useCallback, useEffect, useMemo, useState } from "react"

import { api } from "../api"
import { useAction, useApp } from "../app-context"
import { SortHeader } from "../components/SortHeader"
import { Age, Empty, Field, Skeletons } from "../components/common"
import type { DetectResult, Source, Tier } from "../types"

const ATS_SUBDOMAINS = new Set(["jobs", "boards", "job-boards", "apply", "careers"])

const SLUG = /^[a-z0-9][a-z0-9._-]*$/i

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

function parseBulkUrls(raw: string): { urls: string[]; leftover: string[] } {
  const urls: string[] = []
  const leftover: string[] = []
  const seen = new Set<string>()
  for (const line of raw.split(/\n+/)) {
    const pieces = line
      .split(/,\s+(?=https?:\/\/|\S+\.\S+)/i)
      .map((part) => part.replace(/^[•\-*\d.)\s]+/, "").trim())
      .filter(Boolean)
    for (const piece of pieces) {
      const href = /^https?:\/\//i.test(piece) ? piece : `https://${piece}`
      try {
        const url = new URL(href).href
        if (seen.has(url)) continue
        seen.add(url)
        urls.push(url)
      } catch {
        leftover.push(piece)
      }
    }
  }
  return { urls, leftover }
}

function prettify(slug: string): string {
  return slug
    .split(/[-_.]/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ")
}

/**
 * On a shared board the host names the ATS and the path names the employer, so
 * a label taken from the domain reads "Ashbyhq" for every company on Ashby. The
 * detected token is that employer's own slug; only fall back to the domain when
 * the token is not one (Workday hands back a whole URL).
 */
function labelFor(raw: string, token: string | null): string {
  return token && SLUG.test(token) ? prettify(token) : labelFromUrl(raw)
}

type Pending = DetectResult & { url: string; label: string; tier: Tier }

type SourceSort = "label" | "provider" | "kind" | "tier" | "jobs" | "run" | "status" | "added"

const DEFAULT_DIR: Record<SourceSort, "asc" | "desc"> = {
  label: "asc",
  provider: "asc",
  kind: "asc",
  tier: "asc",
  jobs: "desc",
  run: "desc",
  status: "asc",
  added: "desc",
}

function runStatus(source: Source): "ok" | "error" | "never" {
  if (source.last_ok == null) return "never"
  return Number(source.last_ok) ? "ok" : "error"
}

function compare(a: Source, b: Source, sort: SourceSort, dir: "asc" | "desc"): number {
  const sign = dir === "asc" ? 1 : -1
  let left: string | number = 0
  let right: string | number = 0
  switch (sort) {
    case "label":
      left = a.label.toLowerCase()
      right = b.label.toLowerCase()
      break
    case "provider":
      left = a.provider
      right = b.provider
      break
    case "kind":
      left = a.kind
      right = b.kind
      break
    case "tier":
      left = a.tier
      right = b.tier
      break
    case "jobs":
      left = a.active_jobs
      right = b.active_jobs
      break
    case "run":
      left = a.last_run_at ?? ""
      right = b.last_run_at ?? ""
      break
    case "status":
      left = runStatus(a)
      right = runStatus(b)
      break
    case "added":
      left = a.created_at ?? ""
      right = b.created_at ?? ""
      break
  }
  if (left < right) return -1 * sign
  if (left > right) return 1 * sign
  return b.id - a.id
}

export function Sources({ onOpenJobs }: { onOpenJobs: (source: Source) => void }) {
  const run = useAction()
  const { notify, refreshTick, sourcesTick, runningSourceId } = useApp()
  const [sources, setSources] = useState<Source[] | null>(null)
  const [url, setUrl] = useState("")
  const [detecting, setDetecting] = useState(false)
  const [pending, setPending] = useState<Pending | null>(null)
  const [bulk, setBulk] = useState("")
  const [bulkBusy, setBulkBusy] = useState(false)
  const [bulkProgress, setBulkProgress] = useState<{ done: number; total: number; current: string } | null>(null)
  const [editing, setEditing] = useState<number | null>(null)
  const [draft, setDraft] = useState("")
  const [query, setQuery] = useState("")
  const [kind, setKind] = useState("")
  const [tier, setTier] = useState("")
  const [enabled, setEnabled] = useState("")
  const [status, setStatus] = useState("")
  const [provider, setProvider] = useState("")
  const [sort, setSort] = useState<SourceSort>("added")
  const [dir, setDir] = useState<"asc" | "desc">("desc")

  const load = useCallback(async (silent = false) => {
    if (!silent) setSources(null)
    const result = await run(() => api.sources())
    if (result) setSources(result.sources)
  }, [run])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (refreshTick === 0 && sourcesTick === 0) return
    void load(true)
  }, [refreshTick, sourcesTick, load])

  const providers = useMemo(() => {
    if (!sources) return []
    return [...new Set(sources.map((item) => item.provider))].sort()
  }, [sources])

  const rows = useMemo(() => {
    if (!sources) return []
    const needle = query.trim().toLowerCase()
    return sources
      .filter((item) => {
        if (kind && item.kind !== kind) return false
        if (tier && item.tier !== tier) return false
        if (enabled === "on" && !item.enabled) return false
        if (enabled === "off" && item.enabled) return false
        if (status && runStatus(item) !== status) return false
        if (provider && item.provider !== provider) return false
        if (!needle) return true
        const hay = `${item.label} ${item.provider} ${item.token} ${item.careers_url ?? ""}`.toLowerCase()
        return hay.includes(needle)
      })
      .sort((a, b) => compare(a, b, sort, dir))
  }, [sources, query, kind, tier, enabled, status, provider, sort, dir])

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
    setPending({ ...result, url: url.trim(), label: labelFor(url, result.token), tier: "watchlist" })
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
    setSort("added")
    setDir("desc")
    await load(true)
  }

  async function runBulk() {
    const parsed = parseBulkUrls(bulk)
    if (parsed.urls.length === 0 && parsed.leftover.length === 0) return
    setBulkBusy(true)
    const failed = [...parsed.leftover]
    let added = 0
    try {
      for (const [index, href] of parsed.urls.entries()) {
        setBulkProgress({ done: index, total: parsed.urls.length, current: href })
        const detected = await run(() => api.detect(href))
        if (!detected?.ats || !detected.token) {
          failed.push(href)
          continue
        }
        const created = await run(() =>
          api.createSource({
            kind: "company",
            tier: "watchlist",
            label: labelFor(href, detected.token),
            provider: detected.ats as string,
            token: detected.token as string,
            careers_url: href,
          }),
        )
        if (created) added += 1
        else failed.push(href)
      }
      setBulk(failed.join("\n"))
      notify(
        failed.length === 0
          ? `Добавлено ${added}`
          : `Добавлено ${added} из ${parsed.urls.length}. Неопределённые ссылки остались в поле`,
        failed.length === 0 ? "ok" : "error",
      )
      setSort("added")
      setDir("desc")
      await load(true)
    } finally {
      setBulkBusy(false)
      setBulkProgress(null)
    }
  }

  async function toggle(source: Source) {
    const next = source.enabled ? 0 : 1
    const result = await run(() => api.updateSource(source.id, { enabled: next }))
    if (!result) return
    setSources((prev) => prev?.map((item) => (item.id === source.id ? { ...item, enabled: next } : item)) ?? null)
  }

  async function rename(source: Source) {
    const label = draft.trim()
    setEditing(null)
    if (!label || label === source.label) return
    const result = await run(() => api.updateSource(source.id, { label }))
    if (!result) return
    setSources((prev) => prev?.map((item) => (item.id === source.id ? { ...item, label } : item)) ?? null)
  }

  async function changeTier(source: Source, next: Tier) {
    const result = await run(() => api.updateSource(source.id, { tier: next }))
    if (!result) return
    setSources((prev) => prev?.map((item) => (item.id === source.id ? { ...item, tier: next } : item)) ?? null)
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
    await load(true)
  }

  async function remove(source: Source) {
    if (!confirm(`Удалить «${source.label}»? История откликов сохранится.`)) return
    const result = await run(() => api.deleteSource(source.id), `${source.label} удалена`)
    if (!result) return
    setSources((prev) => prev?.filter((item) => item.id !== source.id) ?? null)
  }

  function sortBy(column: SourceSort) {
    if (sort === column) setDir((prev) => (prev === "asc" ? "desc" : "asc"))
    else {
      setSort(column)
      setDir(DEFAULT_DIR[column])
    }
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
              {pending.guessed ? <span className="badge">угадано по домену</span> : null}
            </div>
            {pending.guessed ? (
              <p className="muted">
                Ссылки на ATS на странице не было, доска найдена по имени домена ({pending.token}). Проверьте, что
                вакансии ниже — действительно этой компании.
              </p>
            ) : null}
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
        <p className="card-sub">По ссылке на строку. Каждая проверяется отдельно — если ATS не нашёлся, ссылка останется в поле.</p>
        <textarea
          className="textarea"
          style={{ minHeight: 120 }}
          placeholder={"https://jobs.lever.co/company\nhttps://company.recruitee.com"}
          value={bulk}
          onChange={(event) => setBulk(event.target.value)}
          disabled={bulkBusy}
        />
        {bulkProgress ? (
          <p className="muted">
            {bulkProgress.done + 1} из {bulkProgress.total}
            {bulkProgress.current ? ` · ${bulkProgress.current}` : ""}
          </p>
        ) : null}
        <div className="row">
          <button className="btn btn-primary btn-sm" disabled={bulkBusy || !bulk.trim()} onClick={() => void runBulk()}>
            {bulkBusy ? "Проверяю…" : "Проверить и добавить"}
          </button>
        </div>
      </section>

      <div className="filters">
        <input
          className="input"
          placeholder="Поиск"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <select className="select" value={kind} onChange={(event) => setKind(event.target.value)}>
          <option value="">Все типы</option>
          <option value="company">компания</option>
          <option value="query">запрос</option>
        </select>
        <select className="select" value={tier} onChange={(event) => setTier(event.target.value)}>
          <option value="">Все уровни</option>
          <option value="watchlist">watchlist</option>
          <option value="discovery">discovery</option>
        </select>
        <select className="select" value={enabled} onChange={(event) => setEnabled(event.target.value)}>
          <option value="">Вкл и выкл</option>
          <option value="on">включённые</option>
          <option value="off">выключенные</option>
        </select>
        <select className="select" value={status} onChange={(event) => setStatus(event.target.value)}>
          <option value="">Любой статус</option>
          <option value="ok">ок</option>
          <option value="error">ошибка</option>
          <option value="never">не запускался</option>
        </select>
        <select className="select" value={provider} onChange={(event) => setProvider(event.target.value)}>
          <option value="">Все ATS</option>
          {providers.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
        <button className="btn btn-ghost btn-sm" onClick={() => void load(true)}>
          Обновить
        </button>
      </div>

      {sources === null ? (
        <Skeletons />
      ) : sources.length === 0 ? (
        <Empty title="Источников нет" hint="Похоже, миграции ещё не накатились." />
      ) : rows.length === 0 ? (
        <Empty title="Ничего не нашлось" hint="Сбросьте фильтры." />
      ) : (
        <>
          <p className="muted">
            {rows.length} из {sources.length}
          </p>
          <div className="table-wrap">
            <table className="table table-compact">
              <thead>
                <tr>
                  <SortHeader column="label" label="Название" sort={sort} dir={dir} onSort={sortBy} />
                  <SortHeader column="tier" label="Уровень" sort={sort} dir={dir} onSort={sortBy} />
                  <SortHeader column="jobs" label="Вакансий" sort={sort} dir={dir} onSort={sortBy} className="col-score" />
                  <SortHeader column="run" label="Прогон" sort={sort} dir={dir} onSort={sortBy} className="col-date" />
                  <SortHeader column="status" label="Статус" sort={sort} dir={dir} onSort={sortBy} />
                  <th className="col-actions" />
                  <SortHeader column="provider" label="ATS" sort={sort} dir={dir} onSort={sortBy} />
                  <SortHeader column="kind" label="Тип" sort={sort} dir={dir} onSort={sortBy} />
                  <th>Ссылка</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((source) => (
                  <tr
                    key={source.id}
                    className={`${runningSourceId === source.id ? "is-busy" : ""} ${source.enabled ? "" : "is-off"}`}
                    title={source.last_error ?? undefined}
                  >
                    <td>
                      {editing === source.id ? (
                        <input
                          className="input"
                          value={draft}
                          autoFocus
                          onChange={(event) => setDraft(event.target.value)}
                          onBlur={() => void rename(source)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter") void rename(source)
                            if (event.key === "Escape") setEditing(null)
                          }}
                        />
                      ) : (
                        <button
                          type="button"
                          className="th-sort"
                          style={{ textTransform: "none", letterSpacing: 0, fontWeight: 600, color: "var(--text-primary)" }}
                          onClick={() => {
                            setEditing(source.id)
                            setDraft(source.label)
                          }}
                        >
                          {source.label}
                        </button>
                      )}
                    </td>
                    <td>
                      <select
                        className="select select-inline"
                        value={source.tier}
                        onChange={(event) => void changeTier(source, event.target.value as Tier)}
                      >
                        <option value="watchlist">watchlist</option>
                        <option value="discovery">discovery</option>
                      </select>
                    </td>
                    <td className="col-score">
                      <button
                        type="button"
                        className="th-sort"
                        style={{ textTransform: "none", letterSpacing: 0, fontWeight: 600 }}
                        title="Вакансии этого источника"
                        onClick={() => onOpenJobs(source)}
                      >
                        {source.active_jobs}
                      </button>
                    </td>
                    <td className="col-date">
                      <Age value={source.last_run_at} warnAfter={7} />
                    </td>
                    <td>
                      {runStatus(source) === "never" ? (
                        <span className="badge badge-neutral">не запускался</span>
                      ) : runStatus(source) === "ok" ? (
                        <span className="badge badge-positive">ок</span>
                      ) : (
                        <span className="badge badge-negative">ошибка</span>
                      )}
                    </td>
                    <td className="col-actions">
                      <div className="row-tight">
                        <button className="btn btn-sm" onClick={() => onOpenJobs(source)}>
                          Вакансии
                        </button>
                        <button className="btn btn-sm" onClick={() => void runOne(source)}>
                          Прогнать
                        </button>
                        <button className="btn btn-sm" onClick={() => void toggle(source)}>
                          {source.enabled ? "Выкл" : "Вкл"}
                        </button>
                        <button className="btn btn-danger btn-sm" onClick={() => void remove(source)}>
                          Удалить
                        </button>
                      </div>
                    </td>
                    <td>{source.provider}</td>
                    <td>{source.kind === "query" ? "запрос" : "компания"}</td>
                    <td className="col-url">
                      {source.careers_url ? (
                        <a className="mono" href={source.careers_url} target="_blank" rel="noreferrer" title={source.careers_url}>
                          {source.careers_url.replace(/^https:\/\//, "")}
                        </a>
                      ) : (
                        <span className="mono">{source.token}</span>
                      )}
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
