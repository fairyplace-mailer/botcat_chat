import type { BotCatAttachmentJson as BotCatAttachment } from "@/server/attachments/blob-mapper";
export type { BotCatAttachment };

export type MessageInputData = {
  message: string;
  attachments?: BotCatAttachment[];
};

export interface MessageInputProps {
  onSend: (data: MessageInputData) => void;
  // можно добавить и другие пропсы по ТЗ (например, disabled, loading, initialAttachments и т.д.)
}

export function MessageInput(props: MessageInputProps) {
  // Реализация компонента (UI, upload-логика и т.д.) здесь
  return <div>MessageInput Component</div>;
}

export default MessageInput;
