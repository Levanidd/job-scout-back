import { useCallback, useState } from "react"

import { api } from "../api"
import { useAction, useApp, useLoader } from "../app-context"
import { Field } from "../components/common"
import type { ModelOption, Settings, ThinkingLevel } from "../types"

const THINKING: Array<{ id: ThinkingLevel; label: string }> = [
  { id: "LOW", label: "Низкий — дешевле и быстрее" },
  { id: "MEDIUM", label: "Средний" },
  { id: "HIGH", label: "Высокий — дороже, ответы обстоятельнее" },
]

const SOURCE_LABELS: Record<Settings["source"], string> = {
  database: "выбрана здесь",
  secret: "из секрета GEMINI_MODEL",
  default: "значение по умолчанию",
}

export function ModelPicker() {
  const run = useAction()
  const { notify } = useApp()
  const [settings, setSettings] = useState<Settings | null>(null)
  const [models, setModels] = useState<ModelOption[]>([])
  const [model, setModel] = useState("")
  const [thinking, setThinking] = useState<ThinkingLevel>("LOW")
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    const current = await run(() => api.settings())
    if (current) {
      setSettings(current)
      setModel(current.model)
      setThinking(current.thinking_level)
    }
    const list = await run(() => api.models())
    if (list?.error) notify(list.error, "error")
    setModels(list?.models ?? [])
  }, [run, notify])

  useLoader(load)

  async function save() {
    setBusy(true)
    const result = await run(() => api.saveSettings({ model, thinking_level: thinking }), "Модель сохранена")
    setBusy(false)
    if (result) setSettings(result)
  }

  if (!settings) return null

  const options = models.some((item) => item.id === model)
    ? models
    : [{ id: model, label: `${model} (текущая)` }, ...models]
  const dirty = model !== settings.model || thinking !== settings.thinking_level

  return (
    <section className="card">
      <h3 className="card-title">Модель для оценки</h3>
      <p className="card-sub">
        Сейчас отвечает <b>{settings.model}</b> — {SOURCE_LABELS[settings.source]}.
      </p>

      {!settings.key_configured ? (
        <p className="error-text">
          Ключ GEMINI_API_KEY не задан, оценки считает локальная эвристика по ключевым словам.
        </p>
      ) : null}

      <Field label="Модель">
        <select className="select" value={model} onChange={(event) => setModel(event.target.value)}>
          {options.map((item) => (
            <option key={item.id} value={item.id}>
              {item.label ? `${item.label} — ${item.id}` : item.id}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Глубина размышлений">
        <select
          className="select"
          value={thinking}
          onChange={(event) => setThinking(event.target.value as ThinkingLevel)}
        >
          {THINKING.map((item) => (
            <option key={item.id} value={item.id}>
              {item.label}
            </option>
          ))}
        </select>
      </Field>

      <p className="muted">
        Размышления оплачиваются как ответ, поэтому именно они определяют счёт. Если модель не поддержит
        выбранный уровень, запрос повторится с её собственным значением.
      </p>

      <div className="row">
        <button className="btn btn-primary btn-sm" disabled={busy || !dirty} onClick={() => void save()}>
          {busy ? "Проверяю…" : "Сохранить"}
        </button>
      </div>
    </section>
  )
}
