import { readFileSync } from "node:fs"
import { localScore, scoreJobs, type ScoreInput } from "../src/scoring"

type EvalJob = {
  id: string
  title: string
  company: string
  location: string
  description: string
  expected: "yes" | "no" | "maybe"
}

const jobs = JSON.parse(readFileSync(new URL("../test/fixtures/eval-set.json", import.meta.url), "utf8")) as EvalJob[]

async function main() {
  const apiKey = process.env.GEMINI_API_KEY
  const model = process.env.GEMINI_MODEL
  const inputs: ScoreInput[] = jobs.map((job) => ({
    external_id: job.id,
    title: job.title,
    company: job.company,
    location: job.location,
    description: job.description,
  }))
  const scored = apiKey
    ? await scoreJobs(inputs, "See eval-set labels.", { apiKey, model })
    : inputs.map(localScore)
  const byId = new Map(scored.map((item) => [item.external_id, item]))

  let yesHit = 0
  let yesN = 0
  let noHit = 0
  let noN = 0
  const misses: string[] = []

  for (const job of jobs) {
    const result = byId.get(job.id)
    if (!result) {
      misses.push(`${job.id} missing score`)
      continue
    }
    if (job.expected === "yes") {
      yesN += 1
      if (result.score >= 70) yesHit += 1
      else misses.push(`YES ${result.score} < 70 — ${job.title} (${result.reason})`)
    }
    if (job.expected === "no") {
      noN += 1
      if (result.score <= 40) noHit += 1
      else misses.push(`NO ${result.score} > 40 — ${job.title} (${result.reason})`)
    }
  }

  console.log(`yes ≥70: ${yesHit}/${yesN}`)
  console.log(`no  ≤40: ${noHit}/${noN}`)
  console.log(`misses: ${misses.length}`)
  for (const line of misses) console.log(" -", line)
  process.exitCode = misses.length <= 3 ? 0 : 1
}

void main()
