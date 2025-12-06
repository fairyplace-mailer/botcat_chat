export type { BotCatAttachmentJson as BotCatAttachment } from "@/server/attachments/blob-mapper";

export type MessageInputData = {
  message: string;
  attachments?: BotCatAttachment[];
};

export interface MessageInputProps {
  onSend: (data: MessageInputData) => void;
  // здесь можно добавить другие пропсы, если потребуется (например, disabled, loading и т.д.)
}

export function MessageInput(props: MessageInputProps) {
  return <div>MessageInput Component</div>;
}

export default MessageInput;
