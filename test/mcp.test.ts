import { beforeEach, describe, expect, it } from "vitest"

import worker from "../src/index"
import { testEnv, type TestEnv } from "./helpers/d1"

let env: TestEnv

beforeEach(() => {
  env = testEnv()
})

async function rpc(method: string, params?: unknown, id: number | null = 1, token: string | null = "test") {
  const headers = new Headers({ "content-type": "application/json" })
  if (token) headers.set("Authorization", `Bearer ${token}`)
  const body = JSON.stringify({ jsonrpc: "2.0", id, method, params })
  const res = await worker.fetch(new Request("https://jobradar.test/api/mcp", { method: "POST", headers, body }), env)
  const text = await res.text()
  return { status: res.status, body: text ? JSON.parse(text) : null }
}

describe("mcp", () => {
  it("requires the same token as the rest of the api", async () => {
    expect((await rpc("tools/list", {}, 1, null)).status).toBe(401)
  })

  it("lists tools and answers a select", async () => {
    const listed = await rpc("tools/list")
    expect(listed.body.result.tools.map((tool: { name: string }) => tool.name)).toEqual(["schema", "query"])

    const schema = await rpc("tools/call", { name: "schema", arguments: {} })
    expect(schema.body.result.isError).toBe(false)
    expect(schema.body.result.content[0].text).toContain("jobs")

    const rows = await rpc("tools/call", {
      name: "query",
      arguments: { sql: "SELECT name FROM users" },
    })
    expect(JSON.parse(rows.body.result.content[0].text)).toEqual([{ name: "Мастер" }])
  })

  it("rejects writes, including a delete hiding behind with", async () => {
    for (const sql of ["DELETE FROM jobs", "WITH c AS (SELECT 1) DELETE FROM jobs", "SELECT 1; DROP TABLE jobs"]) {
      const res = await rpc("tools/call", { name: "query", arguments: { sql } })
      expect(res.body.result.isError).toBe(true)
    }
    expect(await env.DB.prepare(`SELECT COUNT(*) AS n FROM users`).first<{ n: number }>()).toMatchObject({ n: 1 })
  })

  it("accepts a notification without a body", async () => {
    const headers = new Headers({
      "content-type": "application/json",
      Authorization: "Bearer test",
    })
    const res = await worker.fetch(
      new Request("https://jobradar.test/api/mcp", {
        method: "POST",
        headers,
        body: JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }),
      }),
      env,
    )
    expect(res.status).toBe(202)
    expect(await res.text()).toBe("")
  })
})
