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
  OPENAI_MODEL_EMBEDDING:
    process.env.OPENAI_MODEL_EMBEDDING ?? "text-embedding-3-large",

  // Секрет вебхука BotCat → backend
  BOTCAT_WEBHOOK_SECRET: process.env.BOTCAT_WEBHOOK_SECRET ?? "",
};
