# JobRadar

Cloudflare Worker: поиск вакансий по ATS и query-источникам (Arbeitsagentur, Arbeitnow), дедуп, скоринг, Telegram-дайджест.

Спека: [`docs/SPEC.md`](docs/SPEC.md). UI в этот репозиторий не входит — только API.

## Стек

TypeScript, Hono, Cloudflare Workers, D1, Cron. Claude Haiku — опционально (`ANTHROPIC_API_KEY`).

## Поднять у себя

Нужны Node 20+, npm, аккаунт Cloudflare.

```bash
npm install
cp .dev.vars.example .dev.vars
# в .dev.vars задайте ADMIN_TOKEN (обязательно)

npm test
npx wrangler login
npx wrangler d1 create job-scout
```

Скопируйте `database_id` из вывода в `wrangler.toml`.

```bash
npx wrangler d1 migrations apply job-scout --remote

npx wrangler secret put ADMIN_TOKEN
npx wrangler secret put ANTHROPIC_API_KEY      # скоринг Haiku; без него — локальная эвристика
npx wrangler secret put TELEGRAM_BOT_TOKEN     # дайджест; без него вакансии только в D1
npx wrangler secret put TELEGRAM_CHAT_ID

npm run deploy
```

Локально: `npm run dev` → `GET http://127.0.0.1:43142/api/health`.

Крон `0 * * * *`: watchlist (если <20) + 6 discovery-источников.

## API

Все пути кроме `/` и `/api/health` требуют заголовок:

`Authorization: Bearer <ADMIN_TOKEN>`

| Метод | Путь | Зачем |
|---|---|---|
| GET | `/api/health` | живость |
| GET/POST/PATCH/DELETE | `/api/sources[/:id]` | источники |
| POST | `/api/sources/:id/run` | прогон одного |
| POST | `/api/run` | цикл ingest + score + notify |
| POST | `/api/detect` | `{url}` → ATS |
| POST | `/api/sources/bulk-detect` | `{urls:[]}` |
| GET | `/api/discovered?state=new` | новые компании |
| POST | `/api/discovered/:key/add` | в watchlist |
| POST | `/api/discovered/:key/dismiss` | скрыть |
| GET | `/api/jobs` | `?status=&min_score=&company=&tier=` |
| PATCH | `/api/jobs/:id` | `{status}` |
| GET/PUT | `/api/profile` | текст для скоринга |
| POST | `/api/profile/rescore` | обнулить score и пересчитать |
| GET | `/api/runs` | последние 50 прогонов |

Первый прогон источника с `bootstrapped=0` не шлёт уведомления (холодный старт).

## Секреты

| Имя | Зачем |
|---|---|
| `ADMIN_TOKEN` | доступ к API |
| `ANTHROPIC_API_KEY` | скоринг `claude-haiku-4-5-20251001` |
| `TELEGRAM_BOT_TOKEN` + `TELEGRAM_CHAT_ID` | дайджест |
| `ADZUNA_APP_ID` + `ADZUNA_APP_KEY` | опциональный источник |

Ключ Arbeitsagentur публичный, в коде.

## Тесты

```bash
npm test          # парсеры + guard
npm run eval      # 20 вакансий, цель ≤3 расхождений
```
