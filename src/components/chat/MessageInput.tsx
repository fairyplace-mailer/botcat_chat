import React, { useMemo, useRef, useState } from "react";
import { upload } from "@vercel/blob/client";
import { BotCatAttachment } from "@/lib/botcat-attachment";

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

// Stage v1.0: allow common file types that OpenAI can consume.
// We keep it relatively permissive per spec.
const ACCEPT_MIME = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "application/pdf",
  "text/csv",
  "text/plain",
  "application/json",
];

type UploadingItem = {
  id: string;
  name: string;
  type: string;
  progress: number;
};

export function MessageInput(props: MessageInputProps) {
  const [message, setMessage] = useState("");
  const [attachments, setAttachments] = useState<BotCatAttachment[]>([]);
  const [uploading, setUploading] = useState<UploadingItem[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);

  const isBusy = props.disabled || props.loading || uploading.length > 0;

  const acceptAttr = useMemo(() => ACCEPT_MIME.join(","), []);

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    if (isBusy) return;
    const files = Array.from(e.dataTransfer.files);
    void handleFiles(files);
  }

  function onDragOver(e: React.DragEvent) {
    e.preventDefault();
  }

  async function handleFiles(files: File[]) {
    setError(null);

    for (const file of files) {
      if (!file.type || !ACCEPT_MIME.includes(file.type)) {
        setError(`File type not allowed: ${file.name} (${file.type || "unknown"})`);
        continue;
      }

      const uploadId = crypto.randomUUID();
      setUploading((prev) => [
        ...prev,
        { id: uploadId, name: file.name, type: file.type, progress: 0 },
      ]);

      try {
        const blob = await upload(file.name, file, {
          access: "public",
          handleUploadUrl: "/api/blob/upload",
          contentType: file.type,
          // Best-effort UI progress.
          onUploadProgress: (p) => {
            setUploading((prev) =>
              prev.map((u) => (u.id === uploadId ? { ...u, progress: p.percentage } : u)),
            );
          },
        });

        setAttachments((prev) => [
          ...prev,
          {
            attachmentId: crypto.randomUUID(),
            // Message id is created server-side; for UI we keep empty.
            messageId: "ui-memory",
            kind: "user_upload",
            fileName: file.name || null,
            mimeType: file.type || null,
            fileSizeBytes: file.size || null,
            pageCount: null,
            originalUrl: blob.url,
            blobUrlOriginal: blob.url,
            blobUrlPreview: null,
          },
        ]);
      } catch (e: any) {
        setError(`Upload failed: ${file.name}`);
      } finally {
        setUploading((prev) => prev.filter((u) => u.id !== uploadId));
      }
    }

    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (!e.target.files) return;
    const files = Array.from(e.target.files);
    void handleFiles(files);
  }

  function removeAttachment(idx: number) {
    setAttachments((a) => a.filter((_, i) => i !== idx));
  }

  function onSendClick() {
    if (!message.trim() && attachments.length === 0) return;
    props.onSend({ message, attachments });
    setMessage("");
    setAttachments([]);
    setError(null);
  }

  return (
    <div className="message-input_wrapper" onDrop={onDrop} onDragOver={onDragOver}>
      <textarea
        className="message-input_textarea"
        placeholder="Type a message…"
        value={message}
        disabled={isBusy}
        onChange={(e) => setMessage(e.target.value)}
        rows={1}
        style={{ resize: "vertical" }}
      />

      <input
        type="file"
        ref={fileInputRef}
        multiple
        accept={acceptAttr}
        style={{ display: "none" }}
        onChange={onFileChange}
        disabled={isBusy}
      />

      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        disabled={isBusy}
        aria-label="Attach files"
      >
        +
      </button>

      <button
        type="button"
        onClick={onSendClick}
        disabled={isBusy || (!message.trim() && attachments.length === 0)}
        aria-label="Send message"
      >
        Send
      </button>

      {error ? <div className="message-input_error">{error}</div> : null}

      {uploading.length > 0 ? (
        <div className="message-input_uploading">
          {uploading.map((u) => (
            <div key={u.id}>
              Uploading {u.name}… {Math.round(u.progress)}%
            </div>
          ))}
        </div>
      ) : null}

      {attachments.length > 0 ? (
        <div className="message-input_attachments">
          {attachments.map((att, idx) => (
            <div className="message-input_attachment" key={att.attachmentId}>
              <a
                href={att.blobUrlOriginal ?? att.originalUrl ?? undefined}
                target="_blank"
                rel="noreferrer"
              >
                {att.fileName || "attachment"}
              </a>
              {att.mimeType ? <span> ({att.mimeType})</span> : null}
              <button type="button" onClick={() => removeAttachment(idx)} disabled={isBusy}>
                Remove
              </button>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export default MessageInput;
