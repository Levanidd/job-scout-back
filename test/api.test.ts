import { beforeEach, describe, expect, it } from "vitest"

import worker from "../src/index"
import { upsertJobs } from "../src/ingest"
import type { RawJob, SourceRow } from "../src/types"
import { one, testEnv, type TestEnv } from "./helpers/d1"

let env: TestEnv

beforeEach(() => {
  env = testEnv()
})

async function call(
  path: string,
  init: RequestInit & { token?: string | null } = {},
): Promise<{ status: number; body: any }> {
  const { token = "test", ...rest } = init
  const headers = new Headers(rest.headers)
  if (token) headers.set("Authorization", `Bearer ${token}`)
  if (rest.body) headers.set("content-type", "application/json")
  const res = await worker.fetch(new Request(`https://jobradar.test${path}`, { ...rest, headers }), env)
  const text = await res.text()
  return { status: res.status, body: text ? JSON.parse(text) : null }
}

async function seedJob(over: Partial<RawJob> = {}, sourceOver: Partial<SourceRow> = {}): Promise<string> {
  await env.DB.prepare(`INSERT INTO sources (kind, tier, label, provider, token) VALUES (?, ?, ?, ?, ?)`)
    .bind(
      sourceOver.kind ?? "company",
      sourceOver.tier ?? "watchlist",
      sourceOver.label ?? "Acme",
      sourceOver.provider ?? "greenhouse",
      sourceOver.token ?? "acme",
    )
    .run()
  const source = await one<SourceRow>(
    env,
    `SELECT * FROM sources WHERE provider = ? AND token = ?`,
    sourceOver.provider ?? "greenhouse",
    sourceOver.token ?? "acme",
  )
  await upsertJobs(
    env,
    source!,
    [
      {
        externalId: "1",
        title: "Senior Product Manager",
        company: "Acme GmbH",
        url: "https://acme.example/jobs/1",
        location: "Berlin",
        ...over,
      },
    ],
    new Set(),
  )
  const job = await one<{ id: string }>(env, `SELECT id FROM jobs LIMIT 1`)
  return job!.id
}

describe("auth", () => {
  it("lets health through and guards everything else", async () => {
    expect((await call("/api/health", { token: null })).status).toBe(200)
    expect((await call("/api/jobs", { token: null })).status).toBe(401)
    expect((await call("/api/jobs", { token: "wrong" })).status).toBe(401)
  })

  it("answers unknown paths with a json 404", async () => {
    expect(await call("/api/nope")).toMatchObject({ status: 404, body: { error: "not found" } })
  })
})

describe("sources", () => {
  it("creates, lists, renames and soft-deletes", async () => {
    expect(
      await call("/api/sources", {
        method: "POST",
        body: JSON.stringify({ label: "Acme", provider: "greenhouse", token: "acme" }),
      }),
    ).toMatchObject({ status: 200 })

    const listed = await call("/api/sources")
    expect(listed.body.sources).toHaveLength(1)
    expect(listed.body.sources[0]).toMatchObject({ label: "Acme", kind: "company", active_jobs: 0 })

    const id = listed.body.sources[0].id
    expect(
      await call(`/api/sources/${id}`, { method: "PATCH", body: JSON.stringify({ label: "Acme Inc" }) }),
    ).toMatchObject({ status: 200 })
    expect((await call("/api/sources")).body.sources[0].label).toBe("Acme Inc")

    await call(`/api/sources/${id}`, { method: "DELETE" })
    expect((await call("/api/sources")).body.sources).toHaveLength(0)
  })

  it("rejects an incomplete source", async () => {
    expect(await call("/api/sources", { method: "POST", body: JSON.stringify({ label: "x" }) })).toMatchObject({
      status: 400,
    })
  })

  it("hides the manual source from the list", async () => {
    await env.DB.prepare(
      `INSERT INTO sources (kind, tier, label, provider, token, enabled)
       VALUES ('company', 'watchlist', 'Вручную', 'manual', 'manual', 0)`,
    ).run()
    expect((await call("/api/sources")).body.sources).toHaveLength(0)
  })
})

describe("jobs", () => {
  it("lists a job with its source label and tier", async () => {
    await seedJob()
    const res = await call("/api/jobs")
    expect(res.body.jobs).toHaveLength(1)
    expect(res.body.jobs[0]).toMatchObject({ title: "Senior Product Manager", source_label: "Acme", tier: "watchlist" })
  })

  it("filters by viewed, company and score", async () => {
    const id = await seedJob()
    await env.DB.prepare(
      `INSERT INTO user_jobs (user_id, job_id, score) VALUES (1, ?, 80)
       ON CONFLICT(user_id, job_id) DO UPDATE SET score = 80`,
    )
      .bind(id)
      .run()

    expect((await call("/api/jobs?viewed=no")).body.jobs).toHaveLength(1)
    expect((await call("/api/jobs?viewed=yes")).body.jobs).toHaveLength(0)
    await call(`/api/jobs/${id}`, { method: "PATCH", body: JSON.stringify({ viewed: true }) })
    expect((await call("/api/jobs?viewed=yes")).body.jobs).toHaveLength(1)

    expect((await call("/api/jobs?min_score=90")).body.jobs).toHaveLength(0)
    expect((await call("/api/jobs?companies=acme")).body.jobs).toHaveLength(1)
    expect((await call("/api/jobs?companies=other")).body.jobs).toHaveLength(0)
  })

  it("marks a job for later without touching its status", async () => {
    const id = await seedJob()

    expect((await call("/api/jobs?later=no")).body.jobs).toHaveLength(1)
    expect((await call("/api/jobs?later=yes")).body.jobs).toHaveLength(0)

    const res = await call(`/api/jobs/${id}`, { method: "PATCH", body: JSON.stringify({ later: true }) })
    expect(res.body).toMatchObject({ status: "new" })
    expect(res.body.later_at).toBeTruthy()

    expect((await call("/api/jobs?later=yes")).body.jobs).toHaveLength(1)
    expect((await call("/api/jobs?later=no")).body.jobs).toHaveLength(0)

    await call(`/api/jobs/${id}`, { method: "PATCH", body: JSON.stringify({ later: false }) })
    expect((await call("/api/jobs?later=yes")).body.jobs).toHaveLength(0)
  })

  it("filters by whether an application was sent, rejections included", async () => {
    const id = await seedJob()
    expect((await call("/api/jobs?applied=no")).body.jobs).toHaveLength(1)
    expect((await call("/api/jobs?applied=yes")).body.jobs).toHaveLength(0)

    await call(`/api/jobs/${id}`, { method: "PATCH", body: JSON.stringify({ status: "applied" }) })
    expect((await call("/api/jobs?applied=yes")).body.jobs).toHaveLength(1)
    expect((await call("/api/jobs?applied=no")).body.jobs).toHaveLength(0)

    // A rejection is the outcome of an application, so it stays on the applied side.
    await call(`/api/jobs/${id}`, { method: "PATCH", body: JSON.stringify({ status: "rejected" }) })
    expect((await call("/api/jobs?applied=yes&status=any")).body.jobs).toHaveLength(1)
  })

  it("hides blacklisted companies from the list and the picker", async () => {
    await seedJob()
    expect((await call("/api/jobs/companies")).body.companies).toHaveLength(1)

    await call("/api/profile", {
      method: "PUT",
      body: JSON.stringify({ blacklist: [{ company_key: "acme", company: "Acme" }] }),
    })
    expect((await call("/api/jobs")).body.jobs).toHaveLength(0)
    expect((await call("/api/jobs/companies")).body.companies).toHaveLength(0)
  })

  it("sorts on a whitelisted column only", async () => {
    await seedJob()
    expect((await call("/api/jobs?sort=title&dir=asc")).status).toBe(200)
    expect((await call("/api/jobs?sort=drop table&dir=asc")).status).toBe(200)
  })

  it("stamps applied_at on apply and clears it on the way back", async () => {
    const id = await seedJob()
    const applied = await call(`/api/jobs/${id}`, { method: "PATCH", body: JSON.stringify({ status: "applied" }) })
    expect(applied.body.applied_at).not.toBeNull()

    const rejected = await call(`/api/jobs/${id}`, { method: "PATCH", body: JSON.stringify({ status: "rejected" }) })
    expect(rejected.body.applied_at).not.toBeNull()

    const back = await call(`/api/jobs/${id}`, { method: "PATCH", body: JSON.stringify({ status: "new" }) })
    expect(back.body.applied_at).toBeNull()
  })

  it("refuses an unknown status and an empty patch", async () => {
    const id = await seedJob()
    expect(await call(`/api/jobs/${id}`, { method: "PATCH", body: JSON.stringify({ status: "boss" }) })).toMatchObject({
      status: 400,
    })
    expect(await call(`/api/jobs/${id}`, { method: "PATCH", body: JSON.stringify({}) })).toMatchObject({ status: 400 })
  })

  it("404s on a job that is not there", async () => {
    expect((await call("/api/jobs/nope")).status).toBe(404)
    expect(
      (await call("/api/jobs/nope", { method: "PATCH", body: JSON.stringify({ viewed: true }) })).status,
    ).toBe(404)
  })
})

describe("applied", () => {
  it("creates a hand-entered role and lists it", async () => {
    const created = await call("/api/applied", {
      method: "POST",
      body: JSON.stringify({
        title: "Head of Product",
        company: "Beispiel Bank AG",
        url: "https://bank.example/jobs/7",
        applied_at: "2026-02-01",
        notes: "referral",
      }),
    })
    expect(created.status).toBe(201)
    expect(created.body.job).toMatchObject({ title: "Head of Product", status: "applied", source_label: "Вручную" })

    const listed = await call("/api/applied")
    expect(listed.body.jobs).toHaveLength(1)
    expect(listed.body.jobs[0]).toMatchObject({ company: "Beispiel Bank AG" })
    expect((await call("/api/applied?status=interview")).body.jobs).toHaveLength(0)
  })

  it("rejects a manual role without a usable link", async () => {
    const res = await call("/api/applied", {
      method: "POST",
      body: JSON.stringify({ title: "PM", company: "Acme", url: "not a url" }),
    })
    expect(res.status).toBe(400)
    expect(res.body.error).toContain("ссылка")
  })
})

describe("stats", () => {
  it("returns an empty funnel and twelve zeroed buckets", async () => {
    const res = await call("/api/stats")
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({
      found: 0,
      open: 0,
      viewed: 0,
      later: 0,
      applied: 0,
      pipeline: { waiting: 0, interview: 0, rejected: 0 },
      companies: [],
    })
    expect(res.body.weeks).toHaveLength(12)
    expect(res.body.months).toHaveLength(12)
    expect(res.body.weeks.every((row: { total: number }) => row.total === 0)).toBe(true)
    expect(res.body.months.at(-1).start).toMatch(/^\d{4}-\d{2}$/)
  })

  it("counts found, viewed and applied, and splits the pipeline", async () => {
    const id = await seedJob()
    await call(`/api/jobs/${id}`, { method: "PATCH", body: JSON.stringify({ viewed: true, later: true }) })
    await call(`/api/jobs/${id}`, { method: "PATCH", body: JSON.stringify({ status: "applied" }) })

    await env.DB.prepare(
      `INSERT INTO jobs (id, source_id, external_id, company, company_key, title, url, status, first_seen_at, last_seen_at)
       SELECT 'j-int', source_id, '2', company, company_key, 'Interview PM', 'https://acme.example/2',
              'new', datetime('now'), datetime('now') FROM jobs LIMIT 1`,
    ).run()
    await env.DB.prepare(
      `INSERT INTO jobs (id, source_id, external_id, company, company_key, title, url, status, first_seen_at, last_seen_at)
       SELECT 'j-rej', source_id, '3', company, company_key, 'Rejected PM', 'https://acme.example/3',
              'new', datetime('now'), datetime('now') FROM jobs LIMIT 1`,
    ).run()
    await env.DB.prepare(
      `INSERT INTO user_jobs (user_id, job_id, status, applied_at)
       VALUES (1, 'j-int', 'interview', datetime('now', '-10 days')),
              (1, 'j-rej', 'rejected', datetime('now'))`,
    ).run()

    const res = await call("/api/stats")
    expect(res.body).toMatchObject({
      found: 3,
      open: 3,
      viewed: 1,
      later: 1,
      applied: 3,
      pipeline: { waiting: 1, interview: 1, rejected: 1 },
    })
    expect(res.body.companies).toEqual([{ company_key: "acme", company: "Acme GmbH", n: 3 }])
    expect(res.body.weeks.reduce((sum: number, row: { total: number }) => sum + row.total, 0)).toBe(3)
    expect(res.body.months.reduce((sum: number, row: { total: number }) => sum + row.total, 0)).toBe(3)
  })

  it("drops blacklisted companies from the funnel", async () => {
    await seedJob()
    await call("/api/profile", {
      method: "PUT",
      body: JSON.stringify({ blacklist: [{ company_key: "acme", company: "Acme" }] }),
    })
    expect((await call("/api/stats")).body.found).toBe(0)
  })
})

describe("profile", () => {
  it("stores content, prefilter tags and the blacklist together", async () => {
    await seedJob({ title: "Backend Engineer" })

    const saved = await call("/api/profile", {
      method: "PUT",
      body: JSON.stringify({
        content: "senior pm",
        prefilter: { keep: ["Product Manager"], drop: ["Werkstudent"] },
        blacklist: [{ company_key: "Acme", company: "Acme GmbH" }],
      }),
    })
    expect(saved.body.prefilter).toEqual({ keep: ["Product Manager"], drop: ["Werkstudent"] })
    expect(saved.body.blacklist).toEqual([{ company_key: "acme", company: "Acme GmbH" }])
    expect(saved.body.applied).toEqual({ dropped: 1, restored: 0 })

    const loaded = await call("/api/profile")
    expect(loaded.body).toMatchObject({ content: "senior pm" })
    expect(loaded.body.companies).toEqual([{ company_key: "acme", company: "Acme GmbH" }])
  })

  it("refuses a put with nothing in it", async () => {
    expect(await call("/api/profile", { method: "PUT", body: JSON.stringify({}) })).toMatchObject({ status: 400 })
  })

  it("reports that scoring falls back without a key", async () => {
    const res = await call("/api/settings")
    expect(res.body).toMatchObject({ key_configured: false, source: "default", thinking_level: "LOW" })
  })
})

describe("run", () => {
  it("reports an idle cycle and an empty plan", async () => {
    expect((await call("/api/run")).body).toMatchObject({ status: "idle", phase: "sources", done: 0 })
    expect((await call("/api/run/plan")).body).toEqual({ sources: [] })
    expect((await call("/api/runs")).body).toEqual({ runs: [] })
  })

  it("plans the sources that are due", async () => {
    await seedJob()
    expect((await call("/api/run/plan")).body.sources).toHaveLength(1)
  })
})

describe("discovery", () => {
  it("lists companies found on a query board and drops one on dismiss", async () => {
    await seedJob({}, { kind: "query", provider: "arbeitnow", token: "product" })
    const listed = await call("/api/discovered?state=new")
    expect(listed.body.companies).toHaveLength(1)
    expect(listed.body.companies[0]).toMatchObject({ company_key: "acme", jobs_open: 1 })

    await call("/api/discovered/acme/dismiss", { method: "POST" })
    expect((await call("/api/discovered?state=new")).body.companies).toHaveLength(0)
  })

  it("404s when adding a company it has never seen", async () => {
    expect((await call("/api/discovered/ghost/add", { method: "POST" })).status).toBe(404)
    expect((await call("/api/explore/ghost/add", { method: "POST" })).status).toBe(404)
  })

  it("returns nothing for an unknown explore provider", async () => {
    expect((await call("/api/explore?providers=nonsense")).body).toEqual({ companies: [] })
  })
})

describe("users", () => {
  it("returns the current account", async () => {
    expect(await call("/api/me")).toMatchObject({
      status: 200,
      body: { id: 1, name: "Мастер", role: "master" },
    })
  })

  it("lets a master create a user and keeps job actions apart", async () => {
    const created = await call("/api/users", {
      method: "POST",
      body: JSON.stringify({ name: "Лена" }),
    })
    expect(created.status).toBe(201)
    expect(created.body.user).toMatchObject({ name: "Лена", role: "user" })
    const token = created.body.token as string
    expect(token).toBeTruthy()

    const id = await seedJob()
    await call(`/api/jobs/${id}`, { method: "PATCH", body: JSON.stringify({ status: "applied" }) })
    expect((await call("/api/applied")).body.jobs).toHaveLength(1)
    expect((await call("/api/applied", { token })).body.jobs).toHaveLength(0)

    await call(`/api/jobs/${id}`, {
      method: "PATCH",
      token,
      body: JSON.stringify({ status: "ignored" }),
    })
    expect((await call("/api/jobs", { token })).body.jobs).toHaveLength(0)
    expect((await call("/api/jobs")).body.jobs).toHaveLength(1)
    expect((await call("/api/jobs?status=any")).body.jobs[0].status).toBe("applied")
    expect((await call("/api/jobs?status=any", { token })).body.jobs[0].status).toBe("ignored")
  })

  it("forbids a regular user from deleting sources or changing the model", async () => {
    const created = await call("/api/users", {
      method: "POST",
      body: JSON.stringify({ name: "Гость" }),
    })
    await call("/api/sources", {
      method: "POST",
      body: JSON.stringify({ label: "Acme", provider: "greenhouse", token: "acme" }),
    })
    const listed = await call("/api/sources")
    const sourceId = listed.body.sources[0].id
    const token = created.body.token as string

    expect(
      (await call(`/api/sources/${sourceId}`, { method: "DELETE", token })).status,
    ).toBe(403)
    expect(
      (await call("/api/settings", { method: "PUT", token, body: JSON.stringify({ model: "x" }) })).status,
    ).toBe(403)
    expect((await call("/api/users", { token })).status).toBe(403)
    expect((await call("/api/sources")).body.sources).toHaveLength(1)
  })

  it("refuses to demote the last master", async () => {
    expect(
      await call("/api/users/1", { method: "PATCH", body: JSON.stringify({ role: "user" }) }),
    ).toMatchObject({ status: 400, body: { error: "Нужен хотя бы один мастер" } })
  })

  it("promotes a user to master and back", async () => {
    const created = await call("/api/users", {
      method: "POST",
      body: JSON.stringify({ name: "Второй" }),
    })
    const id = created.body.user.id as number
    expect(
      await call(`/api/users/${id}`, { method: "PATCH", body: JSON.stringify({ role: "master" }) }),
    ).toMatchObject({ status: 200, body: { user: { role: "master" } } })
    expect(
      await call(`/api/users/${id}`, { method: "PATCH", body: JSON.stringify({ role: "user" }) }),
    ).toMatchObject({ status: 200, body: { user: { role: "user" } } })
  })
})
