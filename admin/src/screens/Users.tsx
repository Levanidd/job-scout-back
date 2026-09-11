import { useCallback, useState } from "react"

import { api } from "../api"
import { useAction, useApp, useLoader } from "../app-context"
import { Empty, Skeletons } from "../components/common"
import type { AuthUser, ManagedUser } from "../types"
import { Profile } from "./Profile"

function Token({
  token,
  shown,
  onShow,
  onCopy,
}: {
  token: string | null
  shown: boolean
  onShow: () => void
  onCopy: (token: string) => void
}) {
  if (token === null) return <span className="cell-sub">вход по ADMIN_TOKEN</span>
  return (
    <div className="row-tight">
      <code className={`token-value${shown ? "" : " token-masked"}`}>
        {shown ? token : "•".repeat(token.length)}
      </code>
      {shown ? (
        <button className="btn btn-ghost btn-sm" onClick={() => onCopy(token)}>
          Копировать
        </button>
      ) : (
        <button className="btn btn-ghost btn-sm" onClick={onShow}>
          Показать
        </button>
      )}
    </div>
  )
}

export function Users() {
  const run = useAction()
  const { me, notify } = useApp()
  const [users, setUsers] = useState<ManagedUser[] | null>(null)
  const [name, setName] = useState("")
  const [busy, setBusy] = useState(false)
  const [shown, setShown] = useState<number[]>([])
  const [subject, setSubject] = useState<AuthUser | null>(null)

  const load = useCallback(async () => {
    const result = await run(() => api.users())
    if (result) setUsers(result.users)
  }, [run])

  useLoader(load)

  function replace(user: ManagedUser) {
    setUsers((prev) => prev?.map((item) => (item.id === user.id ? user : item)) ?? null)
  }

  async function create() {
    const trimmed = name.trim()
    if (!trimmed) return
    setBusy(true)
    const result = await run(() => api.createUser(trimmed), `${trimmed} создан`)
    setBusy(false)
    if (!result) return
    setName("")
    setShown((prev) => [...prev, result.user.id])
    setUsers((prev) => (prev ? [...prev, result.user] : [result.user]))
  }

  async function toggleRole(user: ManagedUser) {
    const next = user.role === "master" ? "user" : "master"
    const label = next === "master" ? `Сделать «${user.name}» мастером?` : `Снять мастера с «${user.name}»?`
    if (!confirm(label)) return
    const result = await run(() => api.updateUser(user.id, { role: next }))
    if (result) replace(result.user)
  }

  async function resetToken(user: ManagedUser) {
    const warning =
      user.id === me?.id
        ? "Это ваш собственный токен — текущая сессия закроется, входить придётся уже новым."
        : "Старый токен перестанет работать."
    if (!confirm(`Перевыпустить токен для «${user.name}»? ${warning}`)) return
    const result = await run(() => api.resetUserToken(user.id), "Новый токен выдан")
    if (!result) return
    setShown((prev) => (prev.includes(user.id) ? prev : [...prev, user.id]))
    replace(result.user)
  }

  async function copy(token: string) {
    try {
      await navigator.clipboard.writeText(token)
      notify("Токен скопирован", "ok")
    } catch {
      notify("Буфер обмена недоступен, скопируйте вручную", "error")
    }
  }

  if (subject) {
    return (
      <>
        <div className="row" style={{ marginBottom: 12 }}>
          <button className="btn btn-ghost btn-sm" onClick={() => setSubject(null)}>
            ← К списку
          </button>
        </div>
        <Profile subject={{ id: subject.id, name: subject.name }} />
      </>
    )
  }

  return (
    <>
      <section className="card">
        <h3 className="card-title">Новый пользователь</h3>
        <p className="card-sub">
          Имя и личный токен. Токен остаётся в списке — его можно посмотреть и передать человеку в любой
          момент.
        </p>
        <div className="row">
          <input
            className="input grow"
            placeholder="Имя"
            value={name}
            disabled={busy}
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") void create()
            }}
          />
          <button className="btn btn-primary" disabled={busy || !name.trim()} onClick={() => void create()}>
            Создать
          </button>
        </div>
      </section>

      {users === null ? (
        <Skeletons />
      ) : users.length === 0 ? (
        <Empty title="Пользователей нет" hint="Создайте первого." />
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Имя</th>
                <th>Роль</th>
                <th>Токен</th>
                <th className="col-actions" />
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id}>
                  <td>{user.name}</td>
                  <td>
                    <span className={`badge ${user.role === "master" ? "badge-accent" : "badge-neutral"}`}>
                      {user.role === "master" ? "мастер" : "пользователь"}
                    </span>
                  </td>
                  <td>
                    <Token
                      token={user.token}
                      shown={shown.includes(user.id)}
                      onShow={() => setShown((prev) => [...prev, user.id])}
                      onCopy={copy}
                    />
                  </td>
                  <td className="col-actions">
                    <div className="row-tight">
                      <button className="btn btn-sm" onClick={() => setSubject(user)}>
                        Настройки
                      </button>
                      <button className="btn btn-sm" onClick={() => void toggleRole(user)}>
                        {user.role === "master" ? "Сделать пользователем" : "Сделать мастером"}
                      </button>
                      <button className="btn btn-sm" onClick={() => void resetToken(user)}>
                        {user.token === null ? "Выдать токен" : "Перевыпустить"}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}
