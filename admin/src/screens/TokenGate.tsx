import { useState, type FormEvent } from "react"

import { api, forgetToken, setToken, UnauthorizedError } from "../api"

export function TokenGate({ onAuthorized }: { onAuthorized: () => void }) {
  const [value, setValue] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [checking, setChecking] = useState(false)

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!value.trim() || checking) return
    setChecking(true)
    setError(null)
    setToken(value.trim())
    try {
      await api.verify()
      onAuthorized()
    } catch (err) {
      forgetToken()
      setError(err instanceof UnauthorizedError ? "Неверный токен" : "Не удалось связаться с API")
    } finally {
      setChecking(false)
    }
  }

  return (
    <div className="gate">
      <form className="gate-card" onSubmit={submit}>
        <h1>JobRadar</h1>
        <p className="gate-hint">
          Вставьте свой токен. Его выдаёт мастер. Он хранится только в этой вкладке и стирается, когда вы её закрываете.
        </p>
        <input
          className="input"
          type="password"
          value={value}
          autoFocus
          autoComplete="off"
          placeholder="токен"
          onChange={(event) => setValue(event.target.value)}
        />
        {error ? <div className="error-text">{error}</div> : null}
        <button className="btn btn-primary" type="submit" disabled={!value.trim() || checking}>
          {checking ? "Проверяю…" : "Войти"}
        </button>
      </form>
    </div>
  )
}
