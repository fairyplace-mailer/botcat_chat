// ...
// attachments[]
const attachments: BotCatAttachment[] = conversation.attachments.map((a: any) => ({
  attachmentId: a.id,
  messageId: a.message_id,
  kind: a.kind as BotCatAttachment["kind"]
}));

// You might have other parts of the transformation here

// Exporting buildFinalJsonByChatName so that it can be used in other modules
export function buildFinalJsonByChatName(conversation: any): any {
  // Build a final JSON representation for a conversation given its chat name.
  // This is a stub implementation. Adjust the transformation as needed.
  return {
    messages: conversation.messages,
    attachments: attachments,
    // include additional fields if necessary
  };
}
