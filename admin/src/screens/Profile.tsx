import { useCallback, useState } from "react"

import { api } from "../api"
import { useAction, useApp, useLoader } from "../app-context"
import { TagEditor } from "../components/TagEditor"
import { Skeletons } from "../components/common"
import type { BlacklistedCompany, PrefilterRules } from "../types"
function sameTags(left: PrefilterRules, right: PrefilterRules): boolean {
  return JSON.stringify(left) === JSON.stringify(right)
}

export function Profile({ subject }: { subject?: { id: number; name: string } } = {}) {
  const run = useAction()
  const { notify, refresh } = useApp()
  const [content, setContent] = useState<string | null>(null)
  const [saved, setSaved] = useState("")
  const [prefilter, setPrefilter] = useState<PrefilterRules>({ keep: [], drop: [] })
  const [savedPrefilter, setSavedPrefilter] = useState<PrefilterRules>({ keep: [], drop: [] })
  const [blacklist, setBlacklist] = useState<BlacklistedCompany[]>([])
  const [companies, setCompanies] = useState<BlacklistedCompany[]>([])
  const [pick, setPick] = useState("")
  const [busy, setBusy] = useState(false)
  const otherId = subject?.id

  const load = useCallback(async () => {
    const result = await run(() => (otherId ? api.userProfile(otherId) : api.profile()))
    if (!result) return
    setContent(result.content)
    setSaved(result.content)
    const tags = result.prefilter ?? { keep: [], drop: [] }
    setPrefilter(tags)
    setSavedPrefilter(tags)
    setBlacklist(result.blacklist ?? [])
    setCompanies(result.companies ?? [])
  }, [run, otherId])

  useLoader(load)

  async function save() {
    if (content === null) return
    setBusy(true)
    const result = await run(
      () => (otherId ? api.saveUserProfile(otherId, { content }) : api.saveProfile(content)),
      "Профиль сохранён",
    )
    setBusy(false)
    if (result) setSaved(content)
  }

  async function savePrefilter() {
    setBusy(true)
    const result = await run(() =>
      otherId ? api.saveUserProfile(otherId, { prefilter }) : api.savePrefilter(prefilter),
    )
    setBusy(false)
    if (!result) return
    const next = result.prefilter ?? prefilter
    setPrefilter(next)
    setSavedPrefilter(next)
    const dropped = result.applied?.dropped ?? 0
    const restored = result.applied?.restored ?? 0
    notify(`Теги сохранены. Отсеяно ${dropped}, возвращено в очередь ${restored}`, "ok")
  }

  async function persistBlacklist(next: BlacklistedCompany[]) {
    setBusy(true)
    const result = await run(() =>
      otherId ? api.saveUserProfile(otherId, { blacklist: next }) : api.saveBlacklist(next),
    )
    setBusy(false)
    if (!result) return
    setBlacklist(result.blacklist ?? next)
    setPick("")
  }

  function addBlocked() {
    const company = companies.find((item) => item.company_key === pick)
    if (!company) return
    if (blacklist.some((item) => item.company_key === company.company_key)) {
      setPick("")
      return
    }
    void persistBlacklist([...blacklist, company])
  }

  function removeBlocked(key: string) {
    void persistBlacklist(blacklist.filter((item) => item.company_key !== key))
  }

  async function rescore() {
    if (!confirm("Обнулить score активных вакансий и пересчитать заново?")) return
    setBusy(true)
    const result = await run(() => (otherId ? api.rescoreUser(otherId) : api.rescore()))
    setBusy(false)
    if (result) notify(`Пересчитано вакансий: ${result.scored}`, "ok")
  }

  return (
    <>
      {subject ? (
        <section className="card">
          <h3 className="card-title">Настройки: {subject.name}</h3>
          <p className="card-sub">Префильтр, чёрный список и текст для скоринга этого человека. Вакансии и отклики не показываются.</p>
        </section>
      ) : null}

      {content === null ? (
        <Skeletons count={1} />
      ) : (
        <>
          <section className="card">
            <h3 className="card-title">Префильтр по названию</h3>
            <p className="card-sub">
              До модели. Title проходит, если содержит хотя бы один тег из «должно быть», и не содержит
              ни одного из «не должно». Регистр и лишние пробелы не важны. Только для этого профиля.
            </p>

            <div className="prefilter-grid">
              <div className="field">
                <span className="field-label">Должно содержать — хотя бы один</span>
                <TagEditor
                  tags={prefilter.keep}
                  tone="keep"
                  disabled={busy}
                  placeholder="product manager"
                  onChange={(keep) => setPrefilter((prev) => ({ ...prev, keep }))}
                />
              </div>
              <div className="field">
                <span className="field-label">Не должно содержать — ни одного</span>
                <TagEditor
                  tags={prefilter.drop}
                  tone="drop"
                  disabled={busy}
                  placeholder="intern"
                  onChange={(drop) => setPrefilter((prev) => ({ ...prev, drop }))}
                />
              </div>
            </div>

            {prefilter.keep.length === 0 ? (
              <p className="error-text">Без тегов «должно содержать» ни одна вакансия не пройдёт в скоринг.</p>
            ) : null}

            <div className="row">
              <button
                className="btn btn-primary btn-sm"
                disabled={busy || sameTags(prefilter, savedPrefilter)}
                onClick={() => void savePrefilter()}
              >
                Сохранить теги
              </button>
            </div>
          </section>

          <section className="card">
            <h3 className="card-title">Чёрный список компаний</h3>
            <p className="card-sub">
              Вакансии этих компаний по-прежнему собираются для всех, но скрыты в ваших списках и не
              скорятся для этого профиля. Если убрать компанию из списка, они снова появятся у вас.
            </p>

            <div className="tag-editor">
            {blacklist.length > 0 ? (
              <div className="tag-list">
                {blacklist.map((item) => (
                  <span key={item.company_key} className="tag tag-drop">
                    {item.company}
                    <button
                      type="button"
                      className="tag-remove"
                      disabled={busy}
                      aria-label={`Убрать ${item.company}`}
                      onClick={() => removeBlocked(item.company_key)}
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            ) : (
              <p className="muted">Пока пусто</p>
            )}

            <form
              className="tag-add"
              onSubmit={(event) => {
                event.preventDefault()
                addBlocked()
              }}
            >
              <select
                className="select"
                value={pick}
                disabled={busy}
                onChange={(event) => setPick(event.target.value)}
              >
                <option value="">Выберите компанию</option>
                {companies
                  .filter((item) => !blacklist.some((blocked) => blocked.company_key === item.company_key))
                  .map((item) => (
                    <option key={item.company_key} value={item.company_key}>
                      {item.company}
                    </option>
                  ))}
              </select>
              <button className="btn btn-sm" type="submit" disabled={busy || !pick}>
                Добавить
              </button>
            </form>
            </div>
          </section>

          <section className="card">
            <h3 className="card-title">Профиль для скоринга</h3>
            <p className="card-sub">
              Этот текст уходит в системный промпт модели. Единственная ручка калибровки — правьте его, а не код.
            </p>
            <textarea className="textarea" value={content} onChange={(event) => setContent(event.target.value)} />
            <div className="row">
              <button className="btn btn-primary btn-sm" disabled={busy || content === saved} onClick={() => void save()}>
                Сохранить
              </button>
              <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => void refresh()}>
                Обновить
              </button>
              <button className="btn btn-sm" disabled={busy} onClick={() => void rescore()}>
                Пересчитать
              </button>
            </div>
          </section>
        </>
      )}
    </>
  )
}
