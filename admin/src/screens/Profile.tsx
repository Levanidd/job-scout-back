import { useCallback, useEffect, useState } from "react"

import { api } from "../api"
import { useAction, useApp } from "../app-context"
import { TagEditor } from "../components/TagEditor"
import { Skeletons } from "../components/common"
import type { PrefilterRules } from "../types"
import { ModelPicker } from "./ModelPicker"

function sameTags(left: PrefilterRules, right: PrefilterRules): boolean {
  return JSON.stringify(left) === JSON.stringify(right)
}

export function Profile() {
  const run = useAction()
  const { notify, refreshTick, refresh } = useApp()
  const [content, setContent] = useState<string | null>(null)
  const [saved, setSaved] = useState("")
  const [prefilter, setPrefilter] = useState<PrefilterRules>({ keep: [], drop: [] })
  const [savedPrefilter, setSavedPrefilter] = useState<PrefilterRules>({ keep: [], drop: [] })
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    const result = await run(() => api.profile())
    if (!result) return
    setContent(result.content)
    setSaved(result.content)
    const tags = result.prefilter ?? { keep: [], drop: [] }
    setPrefilter(tags)
    setSavedPrefilter(tags)
  }, [run])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (!refreshTick) return
    void load()
  }, [refreshTick, load])

  async function save() {
    if (content === null) return
    setBusy(true)
    const result = await run(() => api.saveProfile(content), "Профиль сохранён")
    setBusy(false)
    if (result) setSaved(content)
  }

  async function savePrefilter() {
    setBusy(true)
    const result = await run(() => api.savePrefilter(prefilter))
    setBusy(false)
    if (!result) return
    const next = result.prefilter ?? prefilter
    setPrefilter(next)
    setSavedPrefilter(next)
    const dropped = result.applied?.dropped ?? 0
    const restored = result.applied?.restored ?? 0
    notify(
      `Теги сохранены. Отсеяно ${dropped}, возвращено в очередь ${restored}`,
      "ok",
    )
  }

  async function rescore() {
    if (!confirm("Обнулить score активных вакансий и пересчитать заново?")) return
    setBusy(true)
    const result = await run(() => api.rescore())
    setBusy(false)
    if (result) notify(`Пересчитано вакансий: ${result.scored}`, "ok")
  }

  return (
    <>
      <ModelPicker />

      {content === null ? (
        <Skeletons count={1} />
      ) : (
        <>
          <section className="card">
            <h3 className="card-title">Префильтр по названию</h3>
            <p className="card-sub">
              До модели. Title проходит, если содержит хотя бы один тег из «должно быть», и не содержит
              ни одного из «не должно». Регистр и лишние пробелы не важны.
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
