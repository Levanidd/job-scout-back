import { adapters } from "./adapters"
import type { Bindings } from "./types"

/** Query boards the Explore tab can turn on without a pasted URL. */
export const EXPLORE_CATALOG: Array<{
  provider: string
  label: string
  token?: string
  sourceLabel?: string
}> = [
  { provider: "himalayas", label: "Himalayas", token: "product", sourceLabel: "Himalayas · product" },
  { provider: "arbeitnow", label: "Arbeitnow", token: "product", sourceLabel: "Arbeitnow · product" },
  { provider: "jobicy", label: "Jobicy", token: "product", sourceLabel: "Jobicy · product" },
  { provider: "thehub", label: "TheHub", token: "product", sourceLabel: "TheHub · product" },
  { provider: "remoteok", label: "Remote OK", token: "product", sourceLabel: "Remote OK · product" },
  { provider: "remotive", label: "Remotive", token: "product", sourceLabel: "Remotive · product" },
  { provider: "workingnomads", label: "Working Nomads", token: "product", sourceLabel: "Working Nomads · product" },
  { provider: "landingjobs", label: "Landing.jobs", token: "product", sourceLabel: "Landing.jobs · product" },
  { provider: "weworkremotely", label: "We Work Remotely", token: "product", sourceLabel: "We Work Remotely · product" },
  { provider: "wttj", label: "Welcome to the Jungle", token: "product manager", sourceLabel: "WTTJ · product manager" },
  { provider: "4dayweek", label: "4 Day Week", token: "product", sourceLabel: "4 Day Week · product" },
  { provider: "justjoin", label: "JustJoin.it", token: "product", sourceLabel: "JustJoin.it · product" },
  { provider: "nofluffjobs", label: "NoFluffJobs", token: "product", sourceLabel: "NoFluffJobs · product" },
  { provider: "manfred", label: "getManfred", token: "product", sourceLabel: "getManfred · product" },
  { provider: "remotli", label: "Remotli", token: "product", sourceLabel: "Remotli · product" },
  { provider: "getonbrd", label: "Get on Board", token: "product", sourceLabel: "Get on Board · product" },
  { provider: "flowxtra", label: "Flowxtra", token: "product", sourceLabel: "Flowxtra · product" },
  { provider: "nodesk", label: "NoDesk", token: "product", sourceLabel: "NoDesk · product" },
  { provider: "joinup", label: "joinup.ch", token: "product", sourceLabel: "joinup.ch · product" },
  {
    provider: "arbeitsagentur",
    label: "Arbeitsagentur",
    token: "was=Product+Manager&wo=Berlin&umkreis=50&angebotsart=1&pav=false",
    sourceLabel: "Arbeitsagentur · PM Berlin",
  },
  {
    provider: "adzuna",
    label: "Adzuna",
    token: "what=product%20manager&where=berlin",
    sourceLabel: "Adzuna · PM Berlin",
  },
  { provider: "getro", label: "Getro" },
  { provider: "consider", label: "Consider" },
]

export type ExploreBoardView = {
  provider: string
  label: string
  jobs: number
  ready: boolean
  sources: { id: number; label: string; enabled: number; jobs: number }[]
}

export async function listExploreBoards(db: D1Database): Promise<ExploreBoardView[]> {
  const rows = await db
    .prepare(
      `SELECT s.provider, s.id, s.label, s.enabled,
         (SELECT COUNT(*) FROM jobs j WHERE j.source_id = s.id AND j.closed_at IS NULL) AS jobs
       FROM sources s
       WHERE s.deleted_at IS NULL AND s.kind = 'query'
       ORDER BY s.provider, s.label`,
    )
    .all<{ provider: string; id: number; label: string; enabled: number; jobs: number }>()

  const byProvider = new Map<string, ExploreBoardView>()
  for (const item of EXPLORE_CATALOG) {
    byProvider.set(item.provider, {
      provider: item.provider,
      label: item.label,
      jobs: 0,
      ready: Boolean(item.token),
      sources: [],
    })
  }

  for (const row of rows.results) {
    const adapter = adapters.find((item) => item.provider === row.provider)
    if (adapter && adapter.kind !== "query") continue
    const board = byProvider.get(row.provider) ?? {
      provider: row.provider,
      label: row.provider,
      jobs: 0,
      ready: false,
      sources: [],
    }
    board.jobs += row.jobs
    board.sources.push({ id: row.id, label: row.label, enabled: row.enabled, jobs: row.jobs })
    board.ready = board.ready || row.enabled === 1
    byProvider.set(row.provider, board)
  }

  return [...byProvider.values()]
}

export async function ensureExploreSources(
  env: Bindings,
  providers: string[],
): Promise<{ sources: { id: number; label: string; provider: string }[]; created: number }> {
  const wanted = [...new Set(providers)].filter((item) =>
    adapters.some((adapter) => adapter.provider === item && adapter.kind === "query"),
  )
  const sources: { id: number; label: string; provider: string }[] = []
  let created = 0

  for (const provider of wanted) {
    const existing = await env.DB.prepare(
      `SELECT id, label FROM sources
       WHERE provider = ? AND kind = 'query' AND deleted_at IS NULL AND enabled = 1
       ORDER BY id`,
    )
      .bind(provider)
      .all<{ id: number; label: string }>()
    if (existing.results.length > 0) {
      for (const row of existing.results) sources.push({ ...row, provider })
      continue
    }

    const catalog = EXPLORE_CATALOG.find((item) => item.provider === provider)
    if (!catalog?.token) continue

    await env.DB.prepare(
      `INSERT INTO sources (kind, tier, label, provider, token, bootstrapped)
       VALUES ('query', 'discovery', ?, ?, ?, 0)
       ON CONFLICT(provider, token) DO UPDATE SET
         deleted_at = NULL, enabled = 1, label = excluded.label, created_at = datetime('now')`,
    )
      .bind(catalog.sourceLabel ?? catalog.label, provider, catalog.token)
      .run()
    created += 1

    const row = await env.DB.prepare(
      `SELECT id, label FROM sources WHERE provider = ? AND token = ? AND deleted_at IS NULL`,
    )
      .bind(provider, catalog.token)
      .first<{ id: number; label: string }>()
    if (row) sources.push({ ...row, provider })
  }

  return { sources, created }
}
