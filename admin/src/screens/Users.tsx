import { useCallback, useState } from "react"

import { api } from "../api"
import { useAction, useLoader } from "../app-context"
import { Empty, Field, Skeletons } from "../components/common"
import type { AuthUser } from "../types"
import { Profile } from "./Profile"

export function Users() {
  const run = useAction()
  const [users, setUsers] = useState<AuthUser[] | null>(null)
  const [name, setName] = useState("")
  const [busy, setBusy] = useState(false)
  const [issued, setIssued] = useState<{ name: string; token: string } | null>(null)
  const [subject, setSubject] = useState<AuthUser | null>(null)

  const load = useCallback(async () => {
    const result = await run(() => api.users())
    if (result) setUsers(result.users)
  }, [run])

  useLoader(load)

  async function create() {
    const trimmed = name.trim()
    if (!trimmed) return
    setBusy(true)
    const result = await run(() => api.createUser(trimmed), `${trimmed} создан`)
    setBusy(false)
    if (!result) return
    setName("")
    setIssued({ name: result.user.name, token: result.token })
    setUsers((prev) => (prev ? [...prev, result.user] : [result.user]))
  }

  async function toggleRole(user: AuthUser) {
    const next = user.role === "master" ? "user" : "master"
    const label = next === "master" ? `Сделать «${user.name}» мастером?` : `Снять мастера с «${user.name}»?`
    if (!confirm(label)) return
    const result = await run(() => api.updateUser(user.id, { role: next }))
    if (!result) return
    setUsers((prev) => prev?.map((item) => (item.id === user.id ? result.user : item)) ?? null)
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
          Имя и личный токен. Токен показывается один раз — его нужно передать человеку.
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
        {issued ? (
          <Field label={`Токен для ${issued.name}`}>
            <input className="input mono" readOnly value={issued.token} onFocus={(event) => event.currentTarget.select()} />
          </Field>
        ) : null}
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
                  <td className="col-actions">
                    <div className="row-tight">
                      <button className="btn btn-sm" onClick={() => setSubject(user)}>
                        Настройки
                      </button>
                      <button className="btn btn-sm" onClick={() => void toggleRole(user)}>
                        {user.role === "master" ? "Сделать пользователем" : "Сделать мастером"}
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
