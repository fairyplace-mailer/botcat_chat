import { coreSystemPrompt } from "@/lib/botcat-system-core";

export type BotCatChatPromptParts = {
  sessionSummaryBlock?: string; // already wrapped [SESSION SUMMARY]..[/SESSION SUMMARY]
  referenceContextBlock?: string; // already wrapped [REFERENCE CONTEXT]..[/REFERENCE CONTEXT]
  webContextBlock?: string; // already wrapped [WEB KB CONTEXT]..[/WEB KB CONTEXT]
  imageInstructionBlock?: string; // image generation protocol block
};

function buildRagRoutingRulesBlock(): string {
  return [
    "[RAG ROUTING RULES]",
    "You have multiple information sources. DO NOT mix them.",
    "- INTERNAL (FairyPlace™ behavior/competencies/FAQ/general): use ONLY [REFERENCE CONTEXT] when relevant.",
    "- POD PARTNERS (Spoonflower, BagsOfLove): use ONLY [WEB KB CONTEXT] when the user asks about POD partner rules, shipping/returns, pricing, requirements, file specs, etc.",
    "- FAIRYPLACE PRODUCTS (future Wix sites integration): if asked about FairyPlace™ product catalog/details and there is no dedicated product context provided, say you don't have that source yet and ask for a link or details.",
    "If none of the provided contexts contain the answer, say so explicitly and answer from general knowledge (and note it may require verification).",
    "Always cite URLs when using [WEB KB CONTEXT].",
    "[/RAG ROUTING RULES]",
  ].join("\n");
}

/**
 * Build system prompt for /api/chat.
 */
export function buildBotCatSystemPrompt(parts: BotCatChatPromptParts): string {
  const session = (parts.sessionSummaryBlock ?? "").trim();
  const ref = (parts.referenceContextBlock ?? "").trim();
  const web = (parts.webContextBlock ?? "").trim();
  const img = (parts.imageInstructionBlock ?? "").trim();

  return [
    coreSystemPrompt,
    buildRagRoutingRulesBlock(),
    session,
    ref,
    web,
    img,
  ]
    .filter(Boolean)
    .join("\n\n")
    .trim();
}
