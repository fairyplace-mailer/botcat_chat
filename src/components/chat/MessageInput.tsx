import React, { useLayoutEffect, useMemo, useRef, useState } from "react";
import { upload } from "@vercel/blob/client";
import { BotCatAttachment } from "@/lib/botcat-attachment";

export type { BotCatAttachment };

export type ExtractedDocument = {
  attachmentId: string;
  fileName: string | null;
  mimeType: string | null;
  text: string;
};

export type MessageInputData = {
  message: string;
  attachments?: BotCatAttachment[];
  extractedDocuments?: ExtractedDocument[];
};

export interface MessageInputProps {
  onSend: (data: MessageInputData) => void;
  disabled?: boolean;
  loading?: boolean;
}

// v1.0 allowed file types (ChatGPT-like, except code):
// - Text: txt, md, pdf, docx, rtf
// - Data: csv, xlsx, json
// - Images: png, jpg/jpeg, webp
// - Archives: zip
const ACCEPT_MIME = [
  "text/plain",
  "text/markdown",
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document", // docx
  "application/rtf",
  "text/csv",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", // xlsx
  "application/json",
  "image/png",
  "image/jpeg",
  "image/webp",
  "application/zip",
] as const;

type UploadingItem = {
  id: string;
  name: string;
  type: string;
  progress: number;
};

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function isImageMime(mime: string | null | undefined): boolean {
  return Boolean(mime && mime.startsWith("image/"));
}

/**
 * Stage 1 rule (docs/spec.md): non-image files are not passed to LLM by URL.
 * The UI must provide extracted text.
 *
 * NOTE: In this repo we keep extraction minimal and safe for Vercel Hobby:
 * - text-like formats: read as text and trim
 * - pdf/docx: will be implemented with pdf.js/mammoth in a follow-up commit
 */
async function extractDocumentText(file: File): Promise<string | null> {
  // simple text-like formats
  const textMimes = new Set([
    "text/plain",
    "text/markdown",
    "application/json",
    "text/csv",
  ]);

  if (textMimes.has(file.type)) {
    const t = await file.text();
    // hard cap to avoid huge payloads
    const MAX_CHARS = 20_000;
    return t.length > MAX_CHARS ? t.slice(0, MAX_CHARS) : t;
  }

  // TODO(Stage 1): implement
  // - application/pdf via pdf.js
  // - docx via mammoth
  return null;
}

export function MessageInput(props: MessageInputProps) {
  const [message, setMessage] = useState("");
  const [attachments, setAttachments] = useState<BotCatAttachment[]>([]);
  const [extractedDocuments, setExtractedDocuments] = useState<ExtractedDocument[]>([]);
  const [uploading, setUploading] = useState<UploadingItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const taRef = useRef<HTMLTextAreaElement | null>(null);

  const isBusy = Boolean(props.disabled || props.loading || uploading.length > 0);
  const acceptAttr = useMemo(() => ACCEPT_MIME.join(","), []);

  function getMaxHeightPx(): number {
    const ta = taRef.current;
    if (!ta || typeof window === "undefined") return 0;

    const style = window.getComputedStyle(ta);
    const lineHeight =
      parseFloat(style.lineHeight) ||
      (parseFloat(style.fontSize) * 1.2) ||
      18;
    const paddingTop = parseFloat(style.paddingTop) || 0;
    const paddingBottom = parseFloat(style.paddingBottom) || 0;
    const borderTop = parseFloat(style.borderTopWidth) || 0;
    const borderBottom = parseFloat(style.borderBottomWidth) || 0;

    // 6 lines max like in botcow
    return Math.round(
      lineHeight * 6 + paddingTop + paddingBottom + borderTop + borderBottom,
    );
  }

  function adjustHeight() {
    const ta = taRef.current;
    if (!ta) return;

    ta.style.height = "auto";
    const maxH = getMaxHeightPx();
    const nextH = Math.min(ta.scrollHeight, maxH || ta.scrollHeight);
    ta.style.height = `${nextH}px`;

    if (ta.scrollHeight > (maxH || Infinity)) {
      ta.scrollTop = ta.scrollHeight;
    }
  }

  useLayoutEffect(() => {
    adjustHeight();

    function onResize() {
      adjustHeight();
    }

    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [message]);

  async function handleFiles(files: File[]) {
    setError(null);

    for (const file of files) {
      if (!file.type || !ACCEPT_MIME.includes(file.type as any)) {
        setError(`File type not allowed: ${file.name} (${file.type || "unknown"})`);
        continue;
      }

      const uploadId = crypto.randomUUID();
      setUploading((prev) => [
        ...prev,
        { id: uploadId, name: file.name, type: file.type, progress: 0 },
      ]);

      const attachmentId = crypto.randomUUID();

      try {
        const blob = await upload(file.name, file, {
          access: "public",
          handleUploadUrl: "/api/blob/upload",
          contentType: file.type,
          onUploadProgress: (p) => {
            setUploading((prev) =>
              prev.map((u) =>
                u.id === uploadId
                  ? { ...u, progress: clamp(p.percentage, 0, 100) }
                  : u,
              ),
            );
          },
        });

        setAttachments((prev) => [
          ...prev,
          {
            attachmentId,
            // messageId assigned server-side; UI keeps a placeholder.
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

        // Extract text for non-image files (Stage 1 requirement).
        if (!isImageMime(file.type)) {
          const text = await extractDocumentText(file);
          if (text) {
            setExtractedDocuments((prev) => [
              ...prev,
              {
                attachmentId,
                fileName: file.name || null,
                mimeType: file.type || null,
                text,
              },
            ]);
          }
        }
      } catch {
        setError(`Upload failed: ${file.name}`);
      } finally {
        setUploading((prev) => prev.filter((u) => u.id !== uploadId));
      }
    }

    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (!e.target.files) return;
    void handleFiles(Array.from(e.target.files));
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    // BotCow behaviour: Enter = send, Shift+Enter = newline
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      onSendClick();
    }
  }

  function removeAttachment(idx: number) {
    const att = attachments[idx];
    setAttachments((a) => a.filter((_, i) => i !== idx));
    if (att) {
      setExtractedDocuments((docs) => docs.filter((d) => d.attachmentId !== att.attachmentId));
    }
  }

  function onSendClick() {
    if (isBusy) return;
    if (!message.trim() && attachments.length === 0) return;

    props.onSend({ message: message.trim(), attachments, extractedDocuments });
    setMessage("");
    setAttachments([]);
    setExtractedDocuments([]);
    setError(null);
  }

  return (
    <div className="message-input_wrapper">
      {/* Attachments chips */}
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
              <button
                type="button"
                className="btn-secondary"
                onClick={() => removeAttachment(idx)}
                disabled={isBusy}
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      ) : null}

      {uploading.length > 0 ? (
        <div className="message-input_uploading">
          {uploading.map((u) => (
            <div key={u.id}>
              Uploading {u.name} {Math.round(u.progress)}%
            </div>
          ))}
        </div>
      ) : null}

      {error ? <div className="message-input_error">{error}</div> : null}

      <div className="message-input_row">
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
          className="btn-secondary message-input_attach"
          onClick={() => fileInputRef.current?.click()}
          disabled={isBusy}
          aria-label="Attach files"
          title="Attach files"
        >
          +
        </button>

        <textarea
          ref={taRef}
          rows={1}
          className="message-input_textarea"
          placeholder="Type a message"
          value={message}
          disabled={isBusy}
          onChange={(e) => setMessage(e.target.value)}
          onInput={adjustHeight}
          onKeyDown={onKeyDown}
        />

        <button
          type="button"
          className="btn-primary"
          onClick={onSendClick}
          disabled={isBusy || (!message.trim() && attachments.length === 0)}
          aria-label="Send message"
        >
          {props.loading ? "Waiting" : "Send"}
        </button>
      </div>
    </div>
  );
}

export default MessageInput;
