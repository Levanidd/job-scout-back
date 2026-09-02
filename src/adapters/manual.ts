import type { Adapter } from "../types"

/** Placeholder so a disabled manual source never crashes getAdapter. */
export const manual: Adapter = {
  provider: "manual",
  kind: "company",
  fetchJobs: async () => [],
}
