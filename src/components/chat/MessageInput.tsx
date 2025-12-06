import React, { useState, FormEvent, ChangeEvent } from "react";

// ... существующий код компонента MessageInput

export function MessageInput(props) {
  // реализация компонента
  return <div>MessageInput Component</div>;
}

// Добавленный default export
export default MessageInput;

// Re-export типов для строгого соответствия ТЗ
export type { BotCatAttachmentJson as BotCatAttachment } from "@/server/attachments/blob-mapper";

export type MessageInputData = {
  message: string;
  attachments?: BotCatAttachment[];
};
