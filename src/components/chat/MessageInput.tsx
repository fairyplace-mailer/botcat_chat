import React, { useState, ChangeEvent, FormEvent } from "react";
import FilePreview from "./FilePreview";

export default function MessageInput({
  onSend,
}: {
  onSend: (data: { message: string; file?: File }) => void;
}) {
  const [message, setMessage] = useState("");
  const [file, setFile] = useState<File | null>(null);

  function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    if (e.target.files?.length) {
      setFile(e.target.files[0]);
    }
  }

  function handleSend(e: FormEvent) {
    e.preventDefault();
    if (message.trim() || file) {
      onSend({ message, file: file || undefined });
      setMessage("");
      setFile(null);
    }
  }
  function handleFileClear() {
    setFile(null);
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
      <label className="attach-btn" title="Attach file">
        <input
          type="file"
          hidden
          onChange={handleFileChange}
        />
        📎
      </label>
      {file && (
        <FilePreview file={file} onClear={handleFileClear} />
      )}
      <button type="submit" className="send-btn" aria-label="Send message">
        ➤
      </button>
    </form>
  );
}
