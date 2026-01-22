# ТЗ: RAG Web-KB для Spoonflower + BagsOfLove (Vercel Hobby)

## 0) Цель
Бот должен использовать актуальные данные с сайтов:
- https://www.spoonflower.com/* (все публичные страницы, кроме разделов про дизайн/дизайнеров/коллекции и т.п. — эти исключения уже есть в коде, сохранить)
- https://www.bagsoflove.com/* (все публичные страницы)

Система должна:
- автоматически находить URL (discovery),
- регулярно скачивать и переиндексировать контент,
- хранить чанки и embeddings в Postgres + pgvector,
- работать в Vercel Hobby (жёсткий лимит ~10s),
- быть управляемой через Cron (Vercel Cron через vercel.json),
- быть устойчивой к параллельным запускам и повторным вызовам.

---

## 1) Архитектура (на что ориентироваться)
Ориентироваться на работающий паттерн “seed + ingest”.

### 1.1. Два процесса
1) Seed (discovery)  
2) Ingest

### 1.2. Хранилище
- Postgres (Neon) + pgvector
- Embeddings: text-embedding-3-small (1536)
- Индекс: HNSW, L2

### 1.3. Устойчивость
- DB CronLock
- Claim due pages в транзакции

---

## 2) Процессы

### 2.1. Seed — /api/cron/web-kb-seed
- BFS discovery
- Canonicalization URL
- Фильтрация доменов
- maxDurationMs: 6500
- maxPages: 200–500

### 2.2. Ingest — /api/cron/web-kb-ingest
- Claim страниц в транзакции
- HTML → Markdown
- Hash check
- Chunking + embeddings батчом
- limitPages: 1
- maxDurationMs: 6500

---

## 3) Prisma / pgvector
- Page
- Chunk
- vector(1536)
- HNSW индекс

---

## 4) Cron (Vercel)
Seed: 1 раз в сутки  
Ingest: каждые 2 минуты

---

## 5) Retrieval
- embedding запроса
- similarity search
- topK 6–10

---

## 6) Проверка
- migrate deploy
- ручной seed
- ручной ingest
- проверка retrieval

---

## 7) Ограничения
- no long-running
- no blob storage
- no per-chunk embeddings
