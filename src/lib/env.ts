export const env = {
  // Ключ OpenAI
  OPENAI_API_KEY: process.env.OPENAI_API_KEY ?? "",

  // Текстовые модели
  // Основной чат (быстрый и дешёвый, default)
  OPENAI_MODEL_CHAT: process.env.OPENAI_MODEL_CHAT ?? "gpt-4.1-mini",

  // Усиленный режим (сложные запросы, большие ТЗ)
  OPENAI_MODEL_CHAT_STRONG:
    process.env.OPENAI_MODEL_CHAT_STRONG ?? "gpt-4.1",

  // Reasoning-модель (точечно, для сложной логики)
  OPENAI_MODEL_REASONING:
    process.env.OPENAI_MODEL_REASONING ?? "o3-mini",

  // Модели изображений
  // Основная генерация (быстрые превью, рабочие эскизы)
  OPENAI_MODEL_IMAGE:
    process.env.OPENAI_MODEL_IMAGE ?? "gpt-image-1-mini",

  // Премиум-картинки (мудборды и ключевые визуалы для клиента)
  OPENAI_MODEL_IMAGE_HIGH:
    process.env.OPENAI_MODEL_IMAGE_HIGH ?? "gpt-image-1",

  // Embeddings для поиска / RAG / аналитики
  // NOTE: RAG spec требует фиксированную модель и размерность.
  OPENAI_MODEL_EMBEDDING:
    process.env.OPENAI_MODEL_EMBEDDING ?? "text-embedding-3-small",

  // Секрет cron-эндпойнтов (Vercel Cron)
  CRON_SECRET: process.env.CRON_SECRET ?? "",

  // Секрет вебхука BotCat → backend
  BOTCAT_WEBHOOK_SECRET: process.env.BOTCAT_WEBHOOK_SECRET ?? "",

  // Admin token for protected internal endpoints (manual maintenance tasks)
  ADMIN_TOKEN: process.env.ADMIN_TOKEN ?? "",

  // Wix App OAuth (instance → access token exchange)
  WIX_APP_ID: process.env.WIX_APP_ID ?? "",
  WIX_APP_SECRET: process.env.WIX_APP_SECRET ?? "",

  // Wix debugging/admin endpoints (do NOT expose publicly)
  WIX_ADMIN_TOKEN: process.env.WIX_ADMIN_TOKEN ?? "",
};
