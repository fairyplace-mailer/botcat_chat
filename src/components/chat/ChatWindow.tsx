import React from "react";
import MessageBubble from "./MessageBubble";
import TypingIndicator from "./TypingIndicator";

export default function ChatWindow({ messages = [], isTyping = false }: {
  messages?: Array<{
    author: "bot" | "user";
    text: string;
    imgBase64?: string;
    fileName?: string;
  }>;
  isTyping?: boolean;
}) {
  // Заглушка chat demo
  const demo = messages.length === 0;
  const chat = demo
    ? [
        { author: "bot", text: "Hi, I'm Botcat! You can upload files and talk with me. 🐾" },
        { author: "user", text: "Hello! Can you see images?" },
        { author: "bot", text: "Sure! Try attaching an image file or pasting base64.", imgBase64: "/BotCat_Portrait.png" },
        { author: "user", text: "[file] This is a PDF report.", fileName: "report.pdf" },
      ]
    : messages;
  return (
    <div className="chat-window">
      {chat.map((m, i) => (
        <MessageBubble key={i} {...m} />
      ))}
      {isTyping && <TypingIndicator />}
    </div>
  );
}
