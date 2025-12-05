import React from "react";
import MessageBubble from "./MessageBubble";
import TypingIndicator from "./TypingIndicator";

// Demo base64 (картинка BotCat)
const botCatImg = "/BotCat_Portrait.png";

const MOCK_CHAT = [
  {
    author: "bot",
    text: "Hello! I am Botcat. How can I assist you today?",
  },
  {
    author: "user",
    text: "Hi! Can you show me a cat picture?",
  },
  {
    author: "bot",
    text: "Sure! Here is one:",
    imgBase64: botCatImg,
  },
  {
    author: "user",
    text: "Thanks! Here is my report.",
    fileName: "report.pdf",
  },
];

const isTyping = true; // for demo

const ChatWindow: React.FC = () => {
  return (
    <div className="chat-window">
      {MOCK_CHAT.map((m, i) => (
        <MessageBubble key={i} {...m} />
      ))}
      {isTyping && <TypingIndicator />}
    </div>
  );
};

export default ChatWindow;
