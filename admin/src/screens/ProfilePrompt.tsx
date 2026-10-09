import { useCallback, useState } from "react"

import { api } from "../api"
import { useAction, useLoader } from "../app-context"

/** Master-only editor for the prompt behind "Скачать промпт для профиля". */
export function ProfilePromptEditor() {
  const run = useAction()
  const [prompt, setPrompt] = useState<string | null>(null)
  const [saved, setSaved] = useState("")
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    const result = await run(() => api.profilePrompt())
    if (!result) return
    setPrompt(result.prompt)
    setSaved(result.prompt)
  }, [run])

  useLoader(load)

  async function save() {
    if (prompt === null) return
    setBusy(true)
    const result = await run(() => api.saveProfilePrompt(prompt), "Промпт сохранён")
    setBusy(false)
    if (!result) return
    setPrompt(result.prompt)
    setSaved(result.prompt)
  }

  if (prompt === null) return null

  return (
    <section className="card">
      <h3 className="card-title">Промпт для профиля</h3>
      <p className="card-sub">
        Его копирует кнопка «Скачать промпт для профиля» в профиле. Один текст для всех пользователей.
      </p>
      <textarea className="textarea" value={prompt} onChange={(event) => setPrompt(event.target.value)} />
      <div className="row">
        <button
          className="btn btn-primary btn-sm"
          disabled={busy || !prompt.trim() || prompt === saved}
          onClick={() => void save()}
        >
          Сохранить
        </button>
        <button className="btn btn-ghost btn-sm" disabled={busy || prompt === saved} onClick={() => setPrompt(saved)}>
          Отменить
        </button>
      </div>
    </section>
  )
}
