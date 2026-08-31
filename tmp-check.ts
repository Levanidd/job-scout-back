import { detectUrl } from "./src/detect"

for (const raw of process.argv.slice(2)) {
  const result = await detectUrl(raw)
  console.log(
    `${String(result.ats).padEnd(10)} ok=${result.ok} jobs=${result.jobs_found} guessed=${result.guessed}  ${raw}`,
  )
  if (result.sample.length) console.log(`   ${result.sample.join(" | ")}`)
}
