/** Anything can be thrown; only a string is ever useful to the caller. */
export function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
