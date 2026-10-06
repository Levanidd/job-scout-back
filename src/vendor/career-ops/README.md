# Vendored providers from career-ops

Copied verbatim from [santifer/career-ops](https://github.com/santifer/career-ops)
(MIT, see `LICENSE`). These are plain ESM modules that take an injected HTTP
client, so they run unchanged on Cloudflare Workers through the bridge in
`src/adapters/career-ops.ts`.

Keep these files as close to upstream as possible: everything that differs
between their model and ours belongs in the bridge, so a fixed upstream file
can be re-copied without reapplying edits.

## Local patches

Their scanner never calls an LLM, so its providers deliberately drop fields it
would not read. Ours scores postings with a model, and a posting without a
description scores on its title alone. Where a payload carries the field for
free, we map it. Every such edit is marked `job-scout patch` in place.

| File | Patch |
| --- | --- |
| `remoteok.mjs` | Keep `description`, `epoch` as `postedAt`, and `salary_min`/`salary_max`. |
| `remotive.mjs` | Keep `description` and `publication_date` as `postedAt`. |
| `landingjobs.mjs` | Keep `gross_salary_low`/`gross_salary_high` as yearly EUR. |
| `_http.mjs` | Trimmed to the retry policy; see below. |

`_http.mjs` upstream also holds the low-level transport, which binds to
`node:dns`, an IP guard and `Buffer` — none of which exist on Workers. Only
`workday.mjs` imports the file, and only for the retry policy, because
providers reach the transport through the injected context instead. The
retained functions are verbatim; `BROWSER_LIKE_USER_AGENT` is inlined from
upstream `user-agent.mjs` so the file has no imports left.

## Boards that cannot be recognised from a URL

`getro` and `consider` run on the fund's own domain, so upstream has them
configured by hand in `portals.yml`. We instead recognise them from the page:
`src/detect.ts` matches the Getro CDN and the Consider board blob, and the
adapters resolve the rest — Getro reads its collection id from the markup on
its own, and `src/adapters/consider.ts` lifts the board id out of the page.
`radancy` (TalentBrew) is the same story on an employer's own domain: the
Radancy CDN on the page gives it away, and that marker is checked before the
others because group sites also link their subsidiaries' Greenhouse boards.

## Known gaps

`join`, `teamtailor`, `softgarden` and `workday` list pages carry no job
description, so postings from them are scored on their title and location
alone. Fetching one description per posting would cost a request each, which
is why upstream does not do it either.

## Re-copying a provider

```sh
curl -fsS -o src/vendor/career-ops/<name>.mjs \
  https://raw.githubusercontent.com/santifer/career-ops/main/providers/<name>.mjs
```

Then re-apply any patch listed above and run `npm test`.
