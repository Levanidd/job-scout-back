import type { Adapter } from "../types"
import { adzuna } from "./adzuna"
import { arbeitsagentur } from "./arbeitsagentur"
import { arbeitnow } from "./arbeitnow"
import { ashby } from "./ashby"
import { consider } from "./consider"
import { getro } from "./getro"
import { greenhouse } from "./greenhouse"
import { himalayas } from "./himalayas"
import { jobicy } from "./jobicy"
import { join } from "./join"
import { landingjobs } from "./landingjobs"
import { lever } from "./lever"
import { personio } from "./personio"
import { recruitee } from "./recruitee"
import { remoteok } from "./remoteok"
import { remotive } from "./remotive"
import { rss } from "./rss"
import { smartrecruiters } from "./smartrecruiters"
import { softgarden } from "./softgarden"
import { teamtailor } from "./teamtailor"
import { thehub } from "./thehub"
import { weworkremotely } from "./weworkremotely"
import { workable } from "./workable"
import { workday } from "./workday"
import { workingnomads } from "./workingnomads"
import { wttj } from "./wttj"

export const adapters: Adapter[] = [
  greenhouse,
  lever,
  ashby,
  personio,
  workable,
  smartrecruiters,
  recruitee,
  join,
  teamtailor,
  softgarden,
  workday,
  arbeitsagentur,
  arbeitnow,
  adzuna,
  himalayas,
  jobicy,
  thehub,
  remoteok,
  remotive,
  workingnomads,
  landingjobs,
  wttj,
  getro,
  consider,
  // Must precede rss, whose detect() would claim /remote-jobs.rss first.
  weworkremotely,
  // rss matches on a generic path pattern, so it stays the last resort.
  rss,
]

export function getAdapter(provider: string): Adapter {
  const found = adapters.find((item) => item.provider === provider)
  if (!found) throw new Error(`Unknown provider: ${provider}`)
  return found
}

export function detectToken(url: URL): { provider: string; token: string } | null {
  for (const adapter of adapters) {
    const token = adapter.detect?.(url) ?? null
    if (token) return { provider: adapter.provider, token }
  }
  return null
}
