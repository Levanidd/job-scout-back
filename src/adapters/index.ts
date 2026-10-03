import type { Adapter } from "../types"
import { fourdayweek } from "./4dayweek"
import { adzuna } from "./adzuna"
import { arbeitsagentur } from "./arbeitsagentur"
import { amazon } from "./amazon"
import { arbeitnow } from "./arbeitnow"
import { ashby } from "./ashby"
import { bamboohr } from "./bamboohr"
import { beesite } from "./beesite"
import { breezy } from "./breezy"
import { consider } from "./consider"
import { eightfold } from "./eightfold"
import { flowxtra } from "./flowxtra"
import { gem } from "./gem"
import { getonbrd } from "./getonbrd"
import { getro } from "./getro"
import { greenhouse } from "./greenhouse"
import { himalayas } from "./himalayas"
import { icims } from "./icims"
import { jobicy } from "./jobicy"
import { jobvite } from "./jobvite"
import { join } from "./join"
import { jazzhr } from "./jazzhr"
import { joinup } from "./joinup"
import { justjoin } from "./justjoin"
import { landingjobs } from "./landingjobs"
import { lever } from "./lever"
import { manfred } from "./manfred"
import { manual } from "./manual"
import { nodesk } from "./nodesk"
import { nofluffjobs } from "./nofluffjobs"
import { oraclecloud } from "./oraclecloud"
import { personio } from "./personio"
import { phenom } from "./phenom"
import { pinpoint } from "./pinpoint"
import { recruitee } from "./recruitee"
import { remoteok } from "./remoteok"
import { remotli } from "./remotli"
import { remotive } from "./remotive"
import { rippling } from "./rippling"
import { rss } from "./rss"
import { smartrecruiters } from "./smartrecruiters"
import { softgarden } from "./softgarden"
import { successfactors } from "./successfactors"
import { taleo } from "./taleo"
import { teamtailor } from "./teamtailor"
import { thehub } from "./thehub"
import { ultipro } from "./ultipro"
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
  successfactors,
  taleo,
  ultipro,
  workday,
  breezy,
  bamboohr,
  pinpoint,
  rippling,
  gem,
  eightfold,
  icims,
  jazzhr,
  jobvite,
  beesite,
  arbeitsagentur,
  amazon,
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
  fourdayweek,
  justjoin,
  nofluffjobs,
  oraclecloud,
  phenom,
  manfred,
  remotli,
  getonbrd,
  flowxtra,
  nodesk,
  joinup,
  // Must precede rss, whose detect() would claim /remote-jobs.rss first.
  weworkremotely,
  // Never scraped; exists so hand-entered applications have a source_id.
  manual,
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
