import { Hono } from "hono"
import { cors } from "hono/cors"

import { resumeStuckCycle } from "./cycle"
import { message } from "./errors"
import { discovery } from "./routes/discovery"
import { jobs } from "./routes/jobs"
import { profile } from "./routes/profile"
import { run } from "./routes/run"
import { sources } from "./routes/sources"
import { stats } from "./routes/stats"
import type { Bindings } from "./types"

const app = new Hono<{ Bindings: Bindings }>()

app.use("/api/*", cors())

app.use("/api/*", async (c, next) => {
  if (c.req.path === "/api/health") return next()
  const expected = c.env.ADMIN_TOKEN
  if (!expected) return c.json({ error: "ADMIN_TOKEN is not configured" }, 500)
  const header = c.req.header("Authorization") ?? ""
  const token = header.startsWith("Bearer ") ? header.slice(7) : ""
  if (token !== expected) return c.json({ error: "unauthorized" }, 401)
  return next()
})

app.get("/api/health", (c) => c.json({ ok: true, service: "jobradar", time: new Date().toISOString() }))

app.route("/", sources)
app.route("/", discovery)
app.route("/", jobs)
app.route("/", stats)
app.route("/", profile)
app.route("/", run)

app.get("/", (c) =>
  c.json({
    service: "jobradar",
    health: "/api/health",
    auth: "Authorization: Bearer <ADMIN_TOKEN>",
  }),
)

app.all("*", (c) => c.json({ error: "not found" }, 404))

app.onError((err, c) => {
  const detail = message(err)
  if (/row read limit|exceeded D1/i.test(detail)) {
    return c.json(
      {
        error:
          "D1 исчерпала дневной лимит чтения. Данные на месте — снова заработает после полуночи UTC (02:00). Пока не запускай прогон.",
      },
      503,
    )
  }
  return c.json({ error: detail }, 500)
})

// Cron never starts a run. It only continues one the isolate dropped.
export default {
  fetch: app.fetch,
  async scheduled(_event: ScheduledEvent, env: Bindings, ctx: ExecutionContext) {
    ctx.waitUntil(resumeStuckCycle(env))
  },
}
