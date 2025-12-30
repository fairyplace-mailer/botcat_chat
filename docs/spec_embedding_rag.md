# ТЗ: Организация embeddings, RAG и system prompt в боте-консультанте

## 1. Цель

1. Использовать embeddings для семантического поиска по документам (RAG) перед ответом модели.
2. Логировать и хранить embeddings для аналитики и будущих задач (Stage 1).
3. Организовать процесс так, чтобы:

   * было удобно расширять функционал (авто-теги, кластеризация, retrieval-based QA),
   * минимизировать дублирование токенов и нагрузку на API,
   * обработка ошибок не приводила к падению чата.

---

## 2. Текущая архитектура

* Next.js / Vercel Hobby
* API route: `/api/chat/route.ts`
* System prompt: `src/lib/botcat-chat-prompt.ts`
* История диалога: live-chat messages
* Embeddings: `text-embedding-3-large`
* DB: Postgres + Prisma
* Хранение: в `messageEmbedding` (Stage 1)
* RAG: поиск по документам перед формированием prompt

---

## 3. Рекомендованная организация пайплайна

### 3.1. Шаги обработки user message

1. Получение запроса от пользователя:

```ts
const userMessage = body.message;
```

2. Обновление session summary:

   * `updateSessionSummary(sessionId, lastMessages)`
   * Сохранять краткое резюме диалога (≤ 500 токенов)
   * Использовать для context в system message

3. Вычисление embedding:

   * Асинхронно, без блокировки чата
   * Сохранять embedding в DB (`messageEmbedding.upsert`)
   * Логировать ошибки через `WebhookLog`

4. RAG — поиск релевантного контента:

   * Использовать embedding userMessage
   * Vector search по документам
   * Ограничить `topK = 3–5`, chunk ≤ 500 токенов
   * Формировать reference context:

```text
[REFERENCE CONTEXT]
<retrieved chunks>
[/REFERENCE CONTEXT]
```

5. Формирование prompt для модели:

```ts
const messages = [
  { role: "system", content: coreSystemPrompt },
  { role: "system", content: sessionSummary },
  { role: "system", content: retrievedContext },
  { role: "user", content: userMessage }
];
```

6. Вызов модели:

```ts
openai.chat.completions.create({
  model,
  stream: true,
  messages
});
```

### 3.2. Обработка ошибок

* Если embedding не вычислен — логировать и продолжать чат без RAG.
* Если retrieval вернул пусто — использовать только system + summary.
* Ошибки DB не должны блокировать live-chat.

### 3.3. Storage & аналитика

* Каждое embedding сохранять с:

  * `sessionId`
  * `messageId`
  * `text`
  * `vector`
  * `type` (user / bot / doc)
  * `timestamp`

### 3.4. Ограничения и best practices

* Не хранить raw history в system prompt (только summary)
* Ограничить размер RAG-контекста ≤ 3–5 чанков
* Обновлять summary каждые 3–5 сообщений
* Не блокировать чат на этапе embedding
* Чётко отделять: core system prompt / session summary / retrieved documents

### 3.5. Дополнительно (на будущее)

* Возможность динамической загрузки разных моделей embeddings
* Авто-теги / категории сообщений
* Versioning правил / документов

---

## 4. Core System Prompt — структура файлов

### 4.1. Структура

```
src/
 └─ lib/
     ├─ botcat-system-core.ts       // основной системный prompt (role, стиль, правила)
     ├─ botcat-session-summary.ts   // функции для работы с summary диалога
     ├─ botcat-retrieval.ts         // вспомогательные функции для RAG / retrieved context
     └─ botcat-chat-prompt.ts       // сборка финального prompt для API chat
```

### 4.2. Содержимое файлов

#### 4.2.1. botcat-system-core.ts

```ts
export const coreSystemPrompt = `
Ты — продуктовый ассистент по дизайну.
Правила:
- Используй только переданный контекст.
- Не выдумывай факты.
- Отвечай кратко и структурировано.
- Если данных недостаточно — уточняй.
Формат ответа:
- Списки и шаги.
- Минимум воды.
`;
```

#### 4.2.2. botcat-session-summary.ts

```ts
import OpenAI from "openai";
export async function updateSessionSummary(oldSummary: string, lastMessages: string) {
  // вызывает модель для сжатия и обновления summary
}
```

#### 4.2.3. botcat-retrieval.ts

```ts
export async function retrieveRelevantChunks(userMessage: string) {
  // 1. Вычисление embedding
  // 2. Поиск в vector DB
  // 3. Возврат topK фрагментов
}
```

#### 4.2.4. botcat-chat-prompt.ts

```ts
import { coreSystemPrompt } from "./botcat-system-core";
import { updateSessionSummary } from "./botcat-session-summary";
import { retrieveRelevantChunks } from "./botcat-retrieval";

export async function buildBotCatChatPrompt(userMessage: string, sessionId: string) {
  const summary = await getSessionSummary(sessionId);
  const context = await retrieveRelevantChunks(userMessage);

  return [
    { role: "system", content: coreSystemPrompt },
    { role: "system", content: summary },
    { role: "system", content: context },
    { role: "user", content: userMessage },
  ];
}
```

---

## 5. Визуальная схема пайплайна

```
User Message
    |
    v
[Session Summary Update] <-- старые сообщения
    |
    v
[Embedding Calculation] ---> [Save in DB / Stage 1]
    |
    v
[Retrieval / Vector Search] ---> topK chunks
    |
    v
[Build Prompt]
(core system + summary + retrieved context + user message)
    |
    v
[OpenAI chat.completions]
    |
    v
[Response Stream]
```

**Комментарии:**

* Summary хранит только ключевые факты, не raw history
* Retrieval добавляет только нужные фрагменты для контекста
* Embeddings логируются и сохраняются отдельно для аналитики и будущего расширения
* Ошибки на этапе embedding или retrieval не блокируют чат

---

## 6. ASCII flow для наглядности

```
+------------------+
|  User Message    |
+--------+---------+
         |
         v
+------------------------+
| Update Session Summary | <- прошлые сообщения
+-----------+------------+
            |
            v
+------------------------+
| Embedding Calculation  | -> сохранение в DB
+-----------+------------+
            |
            v
+------------------------+
| Retrieval / Vector DB  | -> topK chunks
+-----------+------------+
            |
            v
+------------------------+
| Build Prompt           |
| (core + summary +      |
|  retrieved + user)     |
+-----------+------------+
            |
            v
+------------------------+
| OpenAI chat.completions|
+-----------+------------+
            |
            v
+------------------------+
| Response Stream        |
+------------------------+
```

* Flow наглядно показывает последовательность: user -> summary -> embedding -> retrieval -> prompt -> модель -> ответ