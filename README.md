# JobRadar

Cloudflare Worker: поиск вакансий по ATS и query-источникам (Arbeitsagentur, Arbeitnow), дедуп, скоринг, Telegram-дайджест.

Спека: [`docs/SPEC.md`](docs/SPEC.md). Админка на React живёт в `admin/` и раздаётся тем же воркером.

## Стек

TypeScript, Hono, Cloudflare Workers, D1, Cron. Gemini — опционально (`GEMINI_API_KEY`).

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
npx wrangler secret put GEMINI_API_KEY         # скоринг Gemini; без него — локальная эвристика
npx wrangler secret put GEMINI_MODEL           # опционально, по умолчанию gemini-3.7-flash
npx wrangler secret put TELEGRAM_BOT_TOKEN     # дайджест; без него вакансии только в D1
npx wrangler secret put TELEGRAM_CHAT_ID

npm run deploy
```

Локально: `npm run dev` → `GET http://127.0.0.1:43142/api/health`.

Автозапуска нет: прогон стартует только кнопкой «Прогнать» в админке, то есть `POST /api/run`.
Крон (`crons = ["* * * * *"]`) сам цикл никогда не начинает — он лишь подхватывает тот, который
Cloudflare оборвал вместе с `waitUntil`, если ничего не двигалось 45 секунд. Поэтому вкладку можно
закрыть. Большая доска пишется слайсами по 200 вакансий, чтобы один хоп укладывался в бюджет воркера.

## Админка

React + Vite в `admin/`, сборка в `admin/dist`, раздаётся через assets binding. Статика отвечает
первой только на существующие файлы, поэтому `/api/*` уходит в воркер.

Экраны: Ресурсы (Discovery, Исследовать, Источники), Вакансии, Подался, Статистика, Пользователи (только мастер), Профиль.
Вход по личному токену: первый логин с `ADMIN_TOKEN` создаёт мастера, дальше у каждого свой токен из вкладки «Пользователи». Токен хранится в `sessionStorage` вкладки. Мастер видит токены всех выданных им пользователей и может перевыпустить любой; его собственный вход по `ADMIN_TOKEN` показать нельзя, потому что этого секрета в базе нет.

Вакансии, источники и ресурсы общие. Префильтр, чёрный список, скоринг, отклики и статусы — у каждого свои. Добавить источник может любой; выключить, удалить и настроить модель — только мастер. Telegram-дайджест сейчас выключен.

Выставленные фильтры и сортировка переживают перезагрузку — они лежат в `localStorage` под ключами
`jobradar.<экран>.*`. Список вакансий, открытый по кнопке из карточки источника или компании, туда не
пишется: это разовый срез, а не выбор пользователя.

```bash
npm run build       # собрать админку
npm run admin:dev   # Vite на 5173 с проксированием /api на 43142
```

## Деплой

Пуш в `main` деплоит сам: к репозиторию подключён Workers Builds с build command `npm run build` и
deploy command `npx wrangler deploy`. Отдельно катить руками не нужно.

`npm run deploy` остаётся на случай, когда выложить надо в обход гита. Учтите, что он начинается с
`npm --prefix admin ci`, то есть сносит и ставит заново `admin/node_modules`, — локально это лишние
минуты, а однажды он на этом шаге и вовсе завис, уже сделав всю работу.

## API

Все пути кроме `/` и `/api/health` требуют заголовок:

`Authorization: Bearer <токен пользователя>`

Первый вход с `ADMIN_TOKEN`, пока таблица пользователей пуста, создаёт мастера и переносит текущий профиль, оценки и статусы. Дальше этот же секрет работает только если его хеш лежит в `users`.

| Метод | Путь | Зачем |
|---|---|---|
| GET | `/api/health` | живость |
| GET | `/api/me` | текущий пользователь |
| GET/POST | `/api/users` | список и создание (мастер) |
| PATCH | `/api/users/:id` | имя и роль (мастер; последнего мастера снять нельзя) |
| POST | `/api/users/:id/token` | перевыпуск токена (мастер); старый сразу перестаёт работать |
| GET/PUT | `/api/users/:id/profile` | префильтр / чёрный список / текст скоринга другого человека |
| POST | `/api/users/:id/rescore` | пересчёт оценок этого человека |
| GET/POST | `/api/sources` | источники; добавить может любой |
| PATCH/DELETE | `/api/sources/:id` | выкл / имя / удаление — только мастер |
| POST | `/api/sources/:id/run` | прогон одного |
| POST | `/api/run` | цикл ingest + score для того, кто нажал |
| POST | `/api/detect` | `{url}` → ATS |
| POST | `/api/sources/bulk-detect` | `{urls:[]}` |
| GET | `/api/discovered?state=new` | новые компании |
| POST | `/api/discovered/:key/add` | в watchlist |
| POST | `/api/discovered/:key/dismiss` | скрыть |
| GET | `/api/jobs` | `?status=&min_score=&tier=&companies=&added_days=&added_from=&viewed=&later=&applied=&sort=&dir=`; `status=any` — включая отсеянные |
| GET | `/api/jobs/companies` | компании с их числом вакансий под те же фильтры |
| PATCH | `/api/jobs/:id` | `{status}`, `{notes}`, `{viewed}` или `{later}` — только свои |
| GET | `/api/applied` | отклики; `?status=applied\|interview\|rejected` |
| POST | `/api/applied` | вакансия, добавленная руками, без ATS |
| GET | `/api/stats` | воронка найдено/просмотрено/подался, разбивка откликов, ряды по неделям и месяцам; `?days=N` ограничивает воронку и разбивку периодом, ряды остаются за свои 12 недель и 12 месяцев |
| GET/PUT | `/api/profile` | текст для скоринга, keep/drop-теги и чёрный список компаний |
| POST | `/api/profile/rescore` | обнулить score и пересчитать |
| PUT | `/api/settings` | модель Gemini — только мастер |
| GET | `/api/runs` | последние 50 прогонов |
| POST | `/api/mcp` | MCP для Клода и Cursor: только чтение базы. Инструменты `schema` и `query` (один SELECT) |

Роуты разложены по доменам в `src/routes/`; `src/index.ts` только собирает приложение,
проверяет токен и ловит ошибки.

Подключение MCP — тот же адрес воркера и личный токен, что у админки. Запись через этот
эндпоинт не проходит.

```json
{
  "mcpServers": {
    "jobradar": {
      "url": "https://<воркер>/api/mcp",
      "headers": { "Authorization": "Bearer <личный токен>" }
    }
  }
}
```

В Claude Code: `claude mcp add --transport http jobradar https://<воркер>/api/mcp --header "Authorization: Bearer <личный токен>"`.
В Cursor тот же JSON кладётся в MCP settings. Токен в репозиторий не коммитьте.

Первый прогон источника с `bootstrapped=0` не шлёт уведомления (холодный старт).

## Секреты

| Имя | Зачем |
|---|---|
| `ADMIN_TOKEN` | создаёт первого мастера; дальше вход по личным токенам |
| `GEMINI_API_KEY` | скоринг через Gemini |
| `GEMINI_MODEL` | имя модели, по умолчанию `gemini-3.7-flash` |
| `TELEGRAM_BOT_TOKEN` + `TELEGRAM_CHAT_ID` | дайджест |
| `ADZUNA_APP_ID` + `ADZUNA_APP_KEY` | опциональный источник |

Ключ Arbeitsagentur публичный, в коде.

## Тесты

```bash
npm test              # tsc --noEmit + vitest
npm run typecheck     # только типы воркера
npm run typecheck:admin
npm run eval          # 20 вакансий, цель ≤3 расхождений
```

Тесты ingest и API поднимают SQLite в памяти, прогоняют по нему настоящие миграции и дергают
воркер через `app.fetch`, так что запросы проверяются против того же SQL, что уходит в D1.
