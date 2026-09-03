import type { Bindings } from "./types"

/** D1 caps how much one batch can carry, and a long chain also costs a long transaction. */
const BATCH_SIZE = 50

export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

export function placeholders(count: number): string {
  return new Array(count).fill("?").join(", ")
}

/**
 * One round trip per batch instead of one per statement. Ingest writes hundreds
 * of rows per hop, and awaiting each of them separately is what used to push a
 * cycle past the Worker's budget.
 */
export async function runBatch(env: Bindings, statements: D1PreparedStatement[]): Promise<void> {
  for (const part of chunk(statements, BATCH_SIZE)) {
    await env.DB.batch(part)
  }
}

/** Reads a set of rows keyed by an `IN` list without exceeding SQLite's bind limit. */
export async function selectIn<T>(
  env: Bindings,
  sql: (list: string) => string,
  keys: string[],
  size = 80,
): Promise<T[]> {
  const out: T[] = []
  for (const part of chunk(keys, size)) {
    const res = await env.DB.prepare(sql(placeholders(part.length)))
      .bind(...part)
      .all<T>()
    out.push(...res.results)
  }
  return out
}
