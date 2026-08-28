import { useCallback, useEffect, useState } from "react"

import { api } from "../api"
import { useAction, useApp } from "../app-context"
import { Skeletons } from "../components/common"

export function Profile() {
  const run = useAction()
  const { notify } = useApp()
  const [content, setContent] = useState<string | null>(null)
  const [saved, setSaved] = useState("")
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    const result = await run(() => api.profile())
    setContent(result?.content ?? "")
    setSaved(result?.content ?? "")
  }, [run])

  useEffect(() => {
    void load()
  }, [load])

  async function save() {
    if (content === null) return
    setBusy(true)
    const result = await run(() => api.saveProfile(content), "Профиль сохранён")
    setBusy(false)
    if (result) setSaved(content)
  }

  async function rescore() {
    if (!confirm("Обнулить score активных вакансий и пересчитать заново?")) return
    setBusy(true)
    const result = await run(() => api.rescore())
    setBusy(false)
    if (result) notify(`Пересчитано вакансий: ${result.scored}`, "ok")
  }

  if (content === null) return <Skeletons count={1} />

  return (
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
        <button className="btn btn-sm" disabled={busy} onClick={() => void rescore()}>
          Пересчитать
        </button>
      </div>
    </section>
  )
}
