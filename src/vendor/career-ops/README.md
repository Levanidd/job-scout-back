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
| `remoteok.mjs` | Keep `description` and `epoch` as `postedAt`. |
| `remotive.mjs` | Keep `description` and `publication_date` as `postedAt`. |

## Re-copying a provider

```sh
curl -fsS -o src/vendor/career-ops/<name>.mjs \
  https://raw.githubusercontent.com/santifer/career-ops/main/providers/<name>.mjs
```

Then re-apply any patch listed above and run `npm test`.
