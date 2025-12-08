import MessageBubble from "./MessageBubble";
import TypingIndicator from "./TypingIndicator";
import { BotCatAttachment } from "../../lib/botcat-attachment";

// строгий тип Message как в spec.md
export type Author = "bot" | "user";
export interface Message {
  author: Author;
  text: string;
  attachments: BotCatAttachment[];
}

interface ChatWindowProps {
  messages: Message[];
  isTyping: boolean;
}

export default function ChatWindow({ messages, isTyping }: ChatWindowProps) {
  return (
    <div
      className="chat-window"
      style={{
        flex: 1,
        padding: 16,
        overflowY: "auto",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {messages.map((m, i) => (
        <MessageBubble key={i} {...m} />
      ))}
      {isTyping && <TypingIndicator />}
    </div>
  );
}
