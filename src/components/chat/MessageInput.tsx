import React, { useState, FormEvent, ChangeEvent } from "react";

// Тип вложения — строго re-export из серверной схемы
export type { BotCatAttachmentJson as BotCatAttachment } from "@/server/attachments/blob-mapper";

// Тип данных на отправку сообщения — экспортируется
export type MessageInputData = {
  message: string;
  attachments?: BotCatAttachment[];
};

// Пропсы компонента
export interface MessageInputProps {
  onSend: (data: MessageInputData) => void;
  // Дополнительно по ТЗ: если появятся props типа attachments, disabled, loading — добавить сюда строго при их внедрении в UI
}

// Компонент с явной типизацией пропсов
export function MessageInput(props: MessageInputProps) {
  // Временная заглушка
  return <div>MessageInput Component</div>;
}

export default MessageInput;
