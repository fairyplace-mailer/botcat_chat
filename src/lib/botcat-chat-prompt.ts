import { coreSystemPrompt } from "@/lib/botcat-system-core";

export type BotCatChatPromptParts = {
  sessionSummaryBlock?: string; // already wrapped [SESSION SUMMARY]..[/SESSION SUMMARY]
  referenceContextBlock?: string; // already wrapped [REFERENCE CONTEXT]..[/REFERENCE CONTEXT]
  imageInstructionBlock?: string; // image generation protocol block
};

/**
 * Build system prompt for /api/chat.
 *
 * Per docs/spec_embedding_rag.md we separate:
 *  - core system prompt
 *  - session summary
 *  - retrieved reference context
 *
 * Note: we return a single system content string (still one system message),
 * but it is assembled from separated blocks.
 */
export function buildBotCatSystemPrompt(parts: BotCatChatPromptParts): string {
  const session = (parts.sessionSummaryBlock ?? "").trim();
  const ref = (parts.referenceContextBlock ?? "").trim();
  const img = (parts.imageInstructionBlock ?? "").trim();

  return [
    coreSystemPrompt,
    session,
    ref,
    img,
  ]
    .filter(Boolean)
    .join("\n\n")
    .trim();
}
