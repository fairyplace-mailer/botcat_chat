import React from "react";

export default function TypingIndicator() {
  return (
    <div className="typing-indicator" aria-label="Bot is typing">
      <span className="typing-dot" />
      <span className="typing-dot" />
      <span className="typing-dot" />
    </div>
  );
}
