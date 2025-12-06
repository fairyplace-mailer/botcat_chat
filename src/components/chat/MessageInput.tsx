import type { BotCatAttachmentJson as BotCatAttachment } from "@/server/attachments/blob-mapper";
export type { BotCatAttachment };

export type MessageInputData = {
  message: string;
  attachments?: BotCatAttachment[];
};

export interface MessageInputProps {
  onSend: (data: MessageInputData) => void;
}

// (Остальной код компонента должен быть ниже, здесь только типы и экспорт.)
