import MessageBubble from "./MessageBubble";
import TypingIndicator from "./TypingIndicator";

const chat = [
  { author: "bot", text: "Hello! I am Botcat. How can I help you today?" },
  { author: "user", text: "Show me a cat picture!" },
  { author: "bot", text: "Here is a sample image:", imgBase64: "/BotCat_Portrait.png" },
  { author: "user", text: "I am attaching a file.", fileName: "data_report.pdf" },
  { author: "bot", text: "Thank you for your file, processing..." }
];

export default function ChatWindow() {
  const isTyping = true;
  return (
    <div className="chat-window" style={{ flex: 1, padding: 16, overflowY: "auto", display: "flex", flexDirection: "column" }}>
      {chat.map((m, i) => (
        <MessageBubble key={i} {...m} />
      ))}
      {isTyping && <TypingIndicator />}
    </div>
  );
}
