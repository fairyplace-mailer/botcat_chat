import React, { useState, FormEvent, ChangeEvent } from "react";

export interface MessageInputData {
  message: string;
  file?: File;
}

export default function MessageInput({
  onSend,
}: {
  onSend: (data: MessageInputData) => Promise<void> | void;
}) {
  const [message, setMessage] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [filePreview, setFilePreview] = useState<string | null>(null);

  function handleSend(e: FormEvent) {
    e.preventDefault();
    if (!message.trim() && !file) return;
    onSend({ message, file: file || undefined });
    setMessage("");
    setFile(null);
    setFilePreview(null);
  }

  function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    // preview only for images
    if (f.type.startsWith("image/")) {
      const reader = new FileReader();
      reader.onload = ev => setFilePreview(String(ev.target?.result));
      reader.readAsDataURL(f);
    } else {
      setFilePreview(null);
    }
  }

  function handleRemoveFile() {
    setFile(null);
    setFilePreview(null);
  }

  return (
    <form className="message-input" onSubmit={handleSend} style={{ display: "flex", alignItems: "center", gap: 8, padding: 12, borderTop: "1px solid #eee" }}>
      <label style={{ cursor: "pointer", marginRight: 6 }}>
        <span style={{ fontSize: 22, color: file ? '#15a373' : '#999' }}>+</span>
        <input type="file" style={{ display: "none" }} onChange={handleFileChange} />
      </label>
      <input
        type="text"
        value={message}
        onChange={e => setMessage(e.target.value)}
        placeholder="Напишите сообщение..."
        className="input-field"
        aria-label="Message"
        autoComplete="off"
        style={{ flex: 1, fontSize: 16, padding: '7px 12px', borderRadius: 12, border: '1px solid #ddd' }}
      />
      <button type="submit" className="send-btn" aria-label="Отправить" style={{ fontSize: 20, background: "#10a37f", color: "white", border: "none", borderRadius: "50%", width: 38, height: 38, marginLeft: 6, cursor: "pointer" }}>
        ➤
      </button>
      {file && (
        <div style={{ marginLeft: 8, display: 'flex', alignItems: 'center', gap: 5, background: '#fcfcfc', border: '1px solid #eee', borderRadius: 8, padding: '4px 8px', maxWidth: 180 }}>
          {filePreview ? (
            <img src={filePreview} alt="preview" style={{ maxWidth: 36, maxHeight: 28, borderRadius: 4 }} />
          ) : (
            <span role="img" aria-label="file">📎</span>
          )}
          <span style={{ fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 70 }}>{file.name}</span>
          <span style={{ cursor: 'pointer', color: '#e00', fontWeight: 700, marginLeft: 3 }} onClick={handleRemoveFile} title="Удалить файл">×</span>
        </div>
      )}
    </form>
  );
}
