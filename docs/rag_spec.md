# ТЗ: RAG Web-KB для Spoonflower + BagsOfLove (Vercel Hobby)

## 0) Цель
Бот должен использовать актуальные данные с сайтов:
- `https://www.spoonflower.com/*` (все публичные страницы, **кроме** разделов про дизайн/дизайнеров/коллекции и т.п. — эти исключения **уже есть в коде**, сохранить)
- `https://www.bagsoflove.com/*` (все публичные страницы)

Система должна:
- автоматически находить URL (discovery),
- регулярно скачивать и переиндексировать контент,
- хранить чанки и embeddings в Postgres + pgvector,
- работать в Vercel Hobby (жёсткий лимит ~10s),
- быть управляемой через Cron (Vercel Cron через `vercel.json`),
- быть устойчивой к параллельным запускам и повторным вызовам.

---

## 1) Архитектура (на что ориентироваться)
Ориентироваться на работающий паттерн “seed + ingest” из нашей работы:

### 1.1. Два процесса
1) **Seed (discovery)**: собрать список страниц (URL) в БД.
2) **Ingest**: для страниц, которые “пора обновить”, скачать HTML → извлечь контент → markdown → чанки → embeddings → записать в БД.

### 1.2. Хранилище и схемы
- Postgres (Neon) + pgvector extension.
- **Embeddings модель фиксируем**: `text-embedding-3-small` (1536 dims).
- Индексация: **HNSW** под L2 distance (`<->`), opclass `vector_l2_ops`.
- Не использовать Vercel Blob для хранения контента KB. Контент хранить в БД.

### 1.3. Требования устойчивости (обязательные)
- **DB CronLock** (таблица `CronLock`) — mutex на ежедневные/периодические задачи.
- **Claim due pages в транзакции**: при выборе страниц на ingest выставлять “in progress” (push `nextFetchAt = now + 10min`) в транзакции, чтобы параллельные вызовы не взяли одно и то же.

---

## 2) Процессы и как именно настроить

### 2.1. Seed (Discovery) — `/api/cron/web-kb-seed`
Задача: поддерживать актуальный список URL в таблице `Page` (или аналог), для **двух доменов**.

**Discovery стратегия:**
- Стартовые URL:
  - `https://www.spoonflower.com/`
  - `https://www.bagsoflove.com/`
- BFS/очередь, дедуп URL.
- Canonicalization:
  - убрать `#hash`
  - выкинуть query params, которые не влияют на контент (или полностью убрать query, если безопасно)
  - нормализовать слэши
- Фильтрация:
  - Разрешать только http(s) на нужных доменах.
  - Spoonflower: сохранить существующий deny/allow (исключения про дизайнеров/коллекции/дизайн и т.п. — НЕ менять семантику).
  - BagsOfLove: все публичные страницы; исключить только явные мусорные (assets, изображения, pdf, файлы, mailto, tel).
- Лимиты под Hobby:
  - `maxDurationMs` дефолт: **6500**
  - `maxPages` дефолт: **200–500** (seed всё равно остановится по времени)
- Что писать в БД:
  - `url` (unique)
  - `site` (enum/string: `spoonflower` | `bagsoflove`)
  - `lastSeenAt`
  - Для новых URL: `nextFetchAt = now` (чтобы ingest взял сразу)
  - `refreshIntervalHours` дефолт: 24 (настроить per-site при желании)

**Результат seed endpoint должен возвращать JSON-метрики:**
- `fetched` (сколько страниц реально скачали при discovery)
- `discoveredTotal`
- `allowed`
- `inserted`
- `updated`
- `stoppedReason` (`time_budget_exhausted` / `max_pages` / `start_fetch_failed`)
- `startStatus`

---

### 2.2. Ingest — `/api/cron/web-kb-ingest`
Задача: обновлять контент и embeddings только у страниц “due”.

**Выбор страниц:**
- В транзакции выбрать:
  - `nextFetchAt <= now OR nextFetchAt is null`
  - `site in (...)` (можно общий ingest)
- В той же транзакции “claim”:
  - `nextFetchAt = now + 10 minutes` (in progress)

**На страницу:**
1) Fetch HTML (учесть `robots`/redirect, нормальный user-agent).
2) Перед конвертацией **вырезать тяжёлое**:
   - `<script>`, `<style>`, `<noscript>`, `<svg>` (ускорение под Hobby)
3) HTML → Markdown (использовать существующий конвертер в проекте).
4) Канонизировать markdown для `contentHash`:
   - нормализовать пробелы/переносы.
5) Если hash не изменился:
   - не пересчитывать чанки/embeddings
   - `nextFetchAt = now + refreshIntervalHours`
   - увеличить `skippedUnchanged`
6) Если изменился:
   - записать markdown в `Page.text` (или аналог)
   - chunking:
     - `chunkTokens` дефолт: **1100**
     - `overlapTokens` дефолт: **150**
     - `maxChunksPerPage` дефолт: **8**
   - embeddings:
     - батчом, **один запрос на страницу** (`input: string[]`)
     - `maxEmbeddings` дефолт: **8** (и совпадает с maxChunksPerPage)
   - запись embeddings:
     - `embedding vector(1536)` через raw SQL update
     - обновить `embeddingModel`, `dims`

**Ограничения Vercel Hobby (обязательные бюджеты):**
- `maxDurationMs` дефолт: **6500**
- `limitPages` дефолт: **1**
- `maxEmbeddings` дефолт: **8**
- В ответе вернуть time metrics (минимум):
  - `msFetch`, `msTransform`, `msChunk`, `msEmbed`, `msDb`
- Остановка по бюджету должна быть штатной:
  - `stoppedReason: time_budget_exhausted | embed_budget_exhausted | maxChunksPerPage | done`

**Важно: link discovery в ingest**
- По умолчанию **выключить** (`discoverLinks=0`).
- Discovery делается seed’ом.
- Можно оставить опционально `discoverLinks=1`, но только best-effort и если хватает времени.

---

## 3) Prisma / миграции / pgvector (конкретно)
### 3.1. Модели
Использовать одну общую Web-KB схему для обоих сайтов (это проще и лучше для проекта):
- `Site`/`WebSite` (или строковое поле `siteKey` на странице)
- `Page` (`url`, `siteKey`, `text`, `contentHash`, `lastSeenAt`, `nextFetchAt`, `refreshIntervalHours`, `httpStatus`)
- `Chunk/Section` (`pageId`, `idx`, `content`, `embedding vector(1536)`, `embeddingModel`, `dims`)

### 3.2. Миграции
- Коммитить миграции в `prisma/migrations`.
- На сервере используется только:
  - `npx prisma migrate deploy`
  - `npx prisma generate`

### 3.3. Индекс
- `CREATE EXTENSION IF NOT EXISTS vector;`
- `embedding vector(1536)` - сменить модель на `text-embedding-3-small`
- HNSW индекс L2:
  ```sql
  CREATE INDEX IF NOT EXISTS "Chunk_embedding_hnsw_l2_idx"
  ON "Chunk" USING hnsw (embedding vector_l2_ops);
  ```

---

## 4) Cron настройка (Vercel Hobby)
Использовать **Vercel Cron (vercel.json)**, 2 cron’а.

### 4.1. Seed — 1 раз в сутки
- schedule: `0 3 * * *` (UTC)
- path:
  - `/api/cron/web-kb-seed?maxPages=1500&maxDurationMs=6500`

### 4.2. Ingest — каждые 2 минуты
- schedule: `*/2 * * * *`
- path:
  - `/api/cron/web-kb-ingest?limitPages=1`

**Важно:** cron endpoints должны поддерживать auth (Bearer secret) и не полагаться на query token в production.

---

## 5) Логика “как бот этим пользуется”
### 5.1. Retrieval
- При запросе пользователя:
  - embedding user query (model `text-embedding-3-small`)
  - similarity search по `Chunk.embedding <-> query_vector` (L2)
  - topK (например 6–10) и лимит по символам (например 6000–8000 chars)
- В prompt добавлять RAG-context отдельным сообщением (system/developer), с источниками URL.

### 5.2. Требование к prompt
Добавить/сохранить правила:
- если в контексте есть ответ — не задавать лишних вопросов
- при нехватке контекста — честно говорить, что данных нет

---

## 6) Проверка работоспособности (чёткий чеклист)

### 6.1. База/миграции
1) локально/на сервере:
   ```bash
   npx prisma migrate deploy
   npx prisma generate
   ```
2) проверить наличие:
   - таблиц KB
   - колонки embedding vector(1536)
   - индекса hnsw

### 6.2. Ручной прогон seed
Вызвать (через Authorization Bearer):
- seed spoonflower + bagsoflove:
  - ожидаем: `inserted > 0`, `sample` содержит URL обоих доменов.

### 6.3. Ручной прогон ingest
- ingest:
  - ожидаем: `chunksUpserted > 0`, `embedFailures = 0`
  - stoppedReason допустим `maxChunksPerPage` или `time_budget_exhausted` (не ошибка)

### 6.4. Проверка retrieval
- задать боту вопрос, который точно есть на сайте (FAQ/доставка/возвраты и т.п.)
- проверить:
  - в логах/ответе видно, что retrieval вернул chunks
  - модель ссылается на URL источника

### 6.5. Проверка Cron
- добавить/обновить `vercel.json` с crons
- после деплоя убедиться в Vercel Dashboard, что Cron активен и идут вызовы
- по логам подтвердить:
  - seed 1 раз/сутки
  - ingest каждые 2 минуты
  - отсутствуют гонки (CronLock + claim due pages)

---

## 7) Что НЕ делать (заранее неприемлемо)
- Не делать long-running задачи >10s.
- Не делать “один запуск — обойти весь сайт”.
- Не хранить KB в Vercel Blob.
- Не делать embeddings по одному чанку отдельными запросами (нужно батчить).
- Не использовать ivfflat/hnsw индекс для dims > 2000 (поэтому dims фиксируем 1536).
- Не убирать существующие deny/allow правила Spoonflower.

—

# Дополнение к ТЗ

## A) Пример `vercel.json` (целиком)

Если `vercel.json` уже существует — **добавить** эти crons, не ломая существующие. Если файла нет — создать.

```json
{
  "crons": [
    {
      "path": "/api/cron/web-kb-seed?maxPages=1500&maxDurationMs=6500",
      "schedule": "0 3 * * *"
    },
    {
      "path": "/api/cron/web-kb-ingest?limitPages=1",
      "schedule": "*/2 * * * *"
    }
  ]
}
```

Примечания:
- расписание в Vercel Cron считается по **UTC**.
- на Hobby cron может срабатывать не “в секунду”, это нормально.
- ingest должен быть идемпотентным (claim due pages), чтобы частые вызовы не создавали дублей.

---

## B) Примеры JSON-ответов (что считать успешным)

### B1) Seed (discovery) — успешный прогон (пример)
Запрос:
`GET /api/cron/web-kb-seed?maxPages=500&maxDurationMs=6500`

Ожидаемый ответ (пример):
```json
{
  "ok": true,
  "startUrls": ["https://www.spoonflower.com/", "https://www.bagsoflove.com/"],
  "maxPages": 500,
  "maxDurationMs": 6500,
  "fetched": 40,
  "discoveredTotal": 8200,
  "allowed": 120,
  "inserted": 95,
  "updated": 25,
  "sample": [
    "https://www.spoonflower.com/faq",
    "https://www.bagsoflove.com/faq",
    "https://www.bagsoflove.com/shipping"
  ],
  "stoppedReason": "time_budget_exhausted",
  "startStatus": 200
}
```

Что важно:
- `inserted + updated > 0` на первых прогонах.
- `sample` содержит URL **обоих доменов**.
- `stoppedReason` может быть `time_budget_exhausted` — это штатно на Hobby.

---

### B2) Ingest — успешный прогон с эмбеддингами (пример)
Запрос:
`GET /api/cron/web-kb-ingest?limitPages=1&maxDurationMs=6500`

Ожидаемый ответ (пример):
```json
{
  "ok": true,
  "limitPages": 1,
  "fetched": 1,
  "stored": 1,
  "skippedUnchanged": 0,
  "chunksUpserted": 8,
  "embedFailures": 0,
  "embeddingsAttempted": 8,
  "embeddingBatches": 1,
  "embeddingBatchSize": 8,
  "maxEmbeddings": 8,
  "maxChunksPerPage": 8,
  "chunkTokens": 1100,
  "overlapTokens": 150,
  "budgetHit": false,
  "stoppedReason": "maxChunksPerPage",
  "msFetch": 400,
  "msTransform": 900,
  "msChunk": 10,
  "msEmbed": 300,
  "msDb": 1800
}
```

Что важно:
- `chunksUpserted > 0`
- `embedFailures = 0`
- `embeddingBatches = 1` (батч embeddings на страницу)
- `stoppedReason` может быть `maxChunksPerPage` или `time_budget_exhausted` — оба допустимы.

---

### B3) Ingest — unchanged (пример)
Если страница не изменилась:
```json
{
  "ok": true,
  "limitPages": 1,
  "fetched": 1,
  "stored": 0,
  "skippedUnchanged": 1,
  "chunksUpserted": 0,
  "embedFailures": 0,
  "stoppedReason": "done"
}
```

Что важно:
- `skippedUnchanged` растёт со временем.
- не происходит лишних пересчётов.

---

## C) Команды проверки БД (psql) — точечно

### C1) Проверить, что extension vector есть
```bash
psql "$DATABASE_URL" -c '\dx'
```
Ожидаем `vector`.

### C2) Проверить размерность pgvector колонки
(имя таблицы/колонки подставить по факту: `Chunk`/`Section` и т.п.)
```bash
psql "$DATABASE_URL" -c '\d "Chunk"'
```
Ожидаем:
- `embedding vector(1536)`

### C3) Проверить, что индекс HNSW создан
```bash
psql "$DATABASE_URL" -c '\di+ *hnsw*'
```

---

## D) Авторизация cron-endpoints (как должно быть)
Cron endpoints должны принимать:
- `Authorization: Bearer <CRON_SECRET>`

Нежелательно полагаться на `?token=...` в production, чтобы не светить секрет в URL/логах.

Пример вызова:
```bash
curl -sS "https://<app>.vercel.app/api/cron/web-kb-ingest?limitPages=1" \
  -H "Authorization: Bearer <CRON_SECRET>"
```

---