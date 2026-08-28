import type { ReactNode } from "react"

export function Empty({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="empty">
      <div className="empty-title">{title}</div>
      {hint ? <div>{hint}</div> : null}
    </div>
  )
}

export function Skeletons({ count = 3 }: { count?: number }) {
  return (
    <>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="skeleton" />
      ))}
    </>
  )
}

export function ScoreBadge({ score }: { score: number | null }) {
  if (score == null) {
    return (
      <span className="score badge-neutral" title="Ещё не оценена">
        —
      </span>
    )
  }
  const tone = score >= 70 ? "badge-positive" : score >= 55 ? "badge-warning" : "badge-neutral"
  return <span className={`score ${tone}`}>{score}</span>
}

const FLAG_LABELS: Record<string, string> = {
  german_required: "немецкий C1",
  not_senior: "не сеньор",
  relocation_only: "релокация",
  agency_posting: "агентство",
}

function parseFlags(raw: string | null): string[] {
  if (!raw) return []
  try {
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter((f): f is string => typeof f === "string") : []
  } catch {
    return []
  }
}

export function Flags({ raw }: { raw: string | null }) {
  const flags = parseFlags(raw)
  if (flags.length === 0) return null
  return (
    <div className="row-tight" style={{ flexWrap: "wrap" }}>
      {flags.map((flag) => (
        <span key={flag} className="badge badge-negative">
          {FLAG_LABELS[flag] ?? flag}
        </span>
      ))}
    </div>
  )
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
    </label>
  )
}

export function formatDate(value: string | null): string {
  if (!value) return "—"
  const normalised = value.includes("T") ? value : value.replace(" ", "T") + "Z"
  const date = new Date(normalised)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })
}
