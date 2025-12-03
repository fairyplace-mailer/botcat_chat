export const env = {
  OPENAI_API_KEY: process.env.OPENAI_API_KEY ?? "",
  OPENAI_MODEL_CHAT: process.env.OPENAI_MODEL_CHAT ?? "gpt-4.1-mini",
  OPENAI_MODEL_REASONING: process.env.OPENAI_MODEL_REASONING ?? "o3-mini",
  BOTCAT_WEBHOOK_SECRET: process.env.BOTCAT_WEBHOOK_SECRET ?? "",
};
