import React, { useState, FormEvent } from "react";

export default function MessageInput({
  onSend,
}: {
  onSend: (message: string) => void;
}) {
  const [message, setMessage] = useState("");

  function handleSend(e: FormEvent) {
    e.preventDefault();
    if (message.trim()) {
      onSend(message);
      setMessage("");
    }
  }

  return (
    <form className="message-input" onSubmit={handleSend}>
      <input
        type="text"
        value={message}
        onChange={e => setMessage(e.target.value)}
        placeholder="Type your message..."
        className="input-field"
        aria-label="Message"
        autoComplete="off"
      />
      <button type="submit" className="send-btn" aria-label="Send message">
        ➤
      </button>
    </form>
  );
}
