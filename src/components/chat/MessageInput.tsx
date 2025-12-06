import React, { useState, useRef } from "react";
import type { BotCatAttachmentJson as BotCatAttachment } from "@/server/attachments/blob-mapper";

export type { BotCatAttachment };

export type MessageInputData = {
  message: string;
  attachments?: BotCatAttachment[];
};

export interface MessageInputProps {
  onSend: (data: MessageInputData) => void;
  disabled?: boolean;
  loading?: boolean;
}

// Допустимые mime-типы по ТЗ
const ACCEPT_MIME = [
  "image/png", "image/jpeg", "image/webp", "image/gif",
  "audio/mpeg", "audio/ogg", "audio/wav",
  "application/pdf",
  "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
];
const MAX_SIZE = 4.5 * 1024 * 1024; // 4.5 МБ

export function MessageInput(props: MessageInputProps) {
  const [message, setMessage] = useState("");
  const [attachments, setAttachments] = useState<BotCatAttachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);

  // Drag-n-drop
  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    if (props.disabled || props.loading) return;
    const files = Array.from(e.dataTransfer.files);
    handleFiles(files);
  }
  function onDragOver(e: React.DragEvent) {
    e.preventDefault();
  }

  // Upload logic
  async function handleFiles(files: File[]) {
    setError(null);
    setUploading(true);
    for (const file of files) {
      if (file.size > MAX_SIZE) {
        setError(`Файл ${file.name} превышает лимит 4.5 МБ`);
        continue;
      }
      if (!ACCEPT_MIME.includes(file.type)) {
        setError(`Файл ${file.name} не поддерживается (${file.type})`);
        continue;
      }
      try {
        // 1. Получить uploadUrl с backend
        const res = await fetch("/api/blob/upload", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fileName: file.name,
            mimeType: file.type,
            fileSizeBytes: file.size,
          }),
        });
        if (!res.ok) {
          setError(`Ошибка подготовки upload для ${file.name}`);
          continue;
        }
        const { uploadUrl, blobUrl, blobKey } = await res.json();

        // 2. Загрузка файла на uploadUrl
        const uploadRes = await fetch(uploadUrl, {
          method: "PUT",
          body: file,
          headers: { "Content-Type": file.type }
        });
        if (!uploadRes.ok) {
          setError(`Ошибка загрузки файла ${file.name}`);
          continue;
        }

        setAttachments(a => [
          ...a,
          {
            attachmentId: crypto.randomUUID(),
            messageId: "",
            kind: "user_upload",
            fileName: file.name,
            mimeType: file.type,
            fileSizeBytes: file.size,
            blobUrlOriginal: blobUrl,
            originalUrl: blobUrl,
            blobUrlPreview: null,
            pageCount: null,
          }
        ]);
      } catch (err) {
        setError(`Ошибка загрузки файла ${file.name}`);
      }
    }
    setUploading(false);
  }

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (!e.target.files) return;
    const files = Array.from(e.target.files);
    handleFiles(files);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function removeAttachment(idx: number) {
    setAttachments(a => a.filter((_, i) => i !== idx));
  }

  function onSendClick() {
    if (!message.trim() && attachments.length === 0) return;
    props.onSend({ message, attachments });
    setMessage("");
    setAttachments([]);
  }

  return (
    <div className="message-input_wrapper" onDrop={onDrop} onDragOver={onDragOver}>
      <textarea
        className="message-input_textarea"
        placeholder="Введите сообщение..."
        value={message}
        disabled={uploading || props.disabled || props.loading}
        onChange={e => setMessage(e.target.value)}
        rows={1}
        style={{ resize: "vertical" }}
      />
      <input
        type="file"
        ref={fileInputRef}
        multiple
        accept={ACCEPT_MIME.join(",")}
        style={{ display: "none" }}
        onChange={onFileChange}
        disabled={uploading || props.disabled || props.loading}
      />
      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        disabled={uploading || props.disabled || props.loading}
      >
        📎
      </button>
      <button
        type="button"
        onClick={onSendClick}
        disabled={(uploading || props.disabled || props.loading) || (!message.trim() && attachments.length === 0)}
      >
        ⬆️
      </button>
      {error && <div className="message-input_error">{error}</div>}
      <div className="message-input_attachments">
        {attachments.map((att, idx) => (
          <div className="message-input_attachment" key={att.attachmentId}>
            <span>{att.fileName} ({att.mimeType})</span>
            <button type="button" onClick={() => removeAttachment(idx)} disabled={uploading}>✖️</button>
          </div>
        ))}
      </div>
      {uploading && <div className="message-input_uploading">Загружаем файл…</div>}
    </div>
  );
}

export default MessageInput;
