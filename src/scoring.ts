import { passesPrefilter, clipDescription } from "./prefilter"

export type ScoreInput = {
  external_id: string
  title: string
  company: string
  location: string
  description: string
}

export type ScoreOutput = {
  external_id: string
  score: number
  reason: string
  flags: string[]
}

const MODEL = "claude-haiku-4-5-20251001"

const TOOL = {
  name: "submit_scores",
  description: "Return scores for the given jobs",
  input_schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      scores: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            external_id: { type: "string" },
            score: { type: "integer", minimum: 0, maximum: 100 },
            reason: { type: "string" },
            flags: {
              type: "array",
              items: {
                type: "string",
                enum: ["german_required", "not_senior", "relocation_only", "agency_posting"],
              },
            },
          },
          required: ["external_id", "score", "reason", "flags"],
        },
      },
    },
    required: ["scores"],
  },
} as const

export function scoringSystemPrompt(profile: string): string {
  return `You score job postings for a personal job search.

Candidate profile:
${profile}

Scoring rules:
- Senior / lead / principal / head of product: plus. Junior / intern / working student: score 0, flag not_senior.
- Domain fintech, payments, banking, deposits: plus.
- AI/ML product roles: plus.
- German C1/C2 or fluent German required: strong minus, flag german_required.
- Location Berlin or Germany-remote: plus. US-only: score 0, flag relocation_only.
- Recruiting agencies / staff augmentation: minus, flag agency_posting.
- Return 0-100. Be calibrated: 70+ is worth a ping, 55+ only for watchlist companies.

Call submit_scores with one object per job. Never invent jobs.`
}

export function localScore(job: ScoreInput): ScoreOutput {
  const blob = `${job.title}\n${job.location}\n${job.description}`.toLowerCase()
  const flags: string[] = []
  let score = 52
  const reasons: string[] = []

  if (/intern|working student|werkstudent|praktikum|junior|\bjr\.?\b/.test(blob)) {
    flags.push("not_senior")
    return { external_id: job.external_id, score: 0, reason: "Junior/intern level", flags }
  }
  if (/senior|staff|principal|lead|head of/.test(job.title.toLowerCase())) {
    score += 16
    reasons.push("senior-level title")
  }
  if (/fintech|payment|bank|deposit|neobank|lending|insurtech/.test(blob)) {
    score += 14
    reasons.push("fintech/payments domain")
  }
  if (/\bai\b|machine learning|\bml\b/.test(blob)) {
    score += 10
    reasons.push("AI/ML product")
  }
  if (/german c1|german c2|fließend deutsch|fluent german|deutschkenntnisse/.test(blob)) {
    flags.push("german_required")
    score -= 28
    reasons.push("German C1 required")
  }
  if (/berlin|germany|deutschland|dach/.test(blob)) {
    score += 10
    reasons.push("Berlin/Germany location")
  } else if (/london|united kingdom|\buk\b|united states|\busa\b|\bus-only\b/.test(blob)) {
    score = Math.min(score, 38)
    reasons.push("outside Germany")
  }
  if (/us[- ]only|must be in the (us|united states)|united states only|san francisco only/.test(blob)) {
    flags.push("relocation_only")
    score = 0
    reasons.push("US-only")
  }
  if (/consulting company|staffing|recruitment agency|consultancy/.test(blob)) {
    flags.push("agency_posting")
    score = Math.min(score - 18, 35)
    reasons.push("agency/consulting")
  }

  score = Math.max(0, Math.min(100, score))
  return {
    external_id: job.external_id,
    score,
    reason: reasons.join("; ") || "neutral fit",
    flags,
  }
}

type AnthropicResponse = {
  content?: Array<{ type: string; name?: string; input?: { scores?: ScoreOutput[] } }>
}

export async function scoreJobs(
  jobs: ScoreInput[],
  profile: string,
  apiKey: string | undefined,
): Promise<ScoreOutput[]> {
  if (!apiKey) return jobs.map(localScore)
  if (jobs.length === 0) return []

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 4096,
      system: scoringSystemPrompt(profile),
      tools: [TOOL],
      tool_choice: { type: "tool", name: "submit_scores" },
      messages: [
        {
          role: "user",
          content: jobs
            .map(
              (job) =>
                `external_id: ${job.external_id}\n${job.title} @ ${job.company} (${job.location})\n${clipDescription(job.description) ?? ""}`,
            )
            .join("\n\n---\n\n"),
        },
      ],
    }),
  })
  if (!res.ok) {
    throw new Error(`Claude scoring failed: ${res.status}`)
  }
  const body = (await res.json()) as AnthropicResponse
  const tool = body.content?.find((block) => block.type === "tool_use" && block.name === "submit_scores")
  const scores = tool?.input?.scores
  if (!scores) throw new Error("Claude did not call submit_scores")
  return scores
}

export async function scoreInBatches(
  jobs: ScoreInput[],
  profile: string,
  apiKey: string | undefined,
): Promise<ScoreOutput[]> {
  const out: ScoreOutput[] = []
  for (let i = 0; i < jobs.length; i += 10) {
    const chunk = jobs.slice(i, i + 10)
    out.push(...(await scoreJobs(chunk, profile, apiKey)))
  }
  return out
}
