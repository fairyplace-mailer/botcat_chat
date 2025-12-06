"use client";
import React, { useState, FormEvent, ChangeEvent } from "react";
import { upload } from "@vercel/blob";

export interface BotCatAttachment {
  blobKey: string;
  blobUrl: string;
  fileName: string;
  mimeType: string;
  fileSizeBytes: number;
}

export interface MessageInputData {
  message: string;
  attachments?: BotCatAttachment[];
}

export default function MessageInput({
  onSend,
}: {
  onSend: (data: MessageInputData) => Promise<void> | void;
}) {
  const [message, setMessage] = useState("");
  const [uploading, setUploading] = useState(false);
  const [attachments, setAttachments] = useState<BotCatAttachment[]>([]);

  async function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      // Upload file directly to Vercel Blob Store
      const { blobKey, blobUrl } = await upload(file);
      const newAttachment: BotCatAttachment = {
        blobKey,
        blobUrl,
        fileName: file.name,
        mimeType: file.type,
        fileSizeBytes: file.size,
      };
      setAttachments([newAttachment]);
    } catch (error) {
      // TODO: handle error uploading
      alert("Failed to upload file to Blob Store.");
    } finally {
      setUploading(false);
    }
    // Reset input value to allow re-upload same file if needed
    e.target.value = "";
  }

  function handleRemoveAttachment() {
    setAttachments([]);
  }

  async function handleSend(e: FormEvent) {
    e.preventDefault();
    if (!message.trim() && attachments.length === 0) return;
    await onSend({ message, attachments });
    setMessage("");
    setAttachments([]);
  }

  return (
    <form
      className="message-input"
      onSubmit={handleSend}
      style={{ display: "flex", alignItems: "center", gap: 8, padding: 12, borderTop: "1px solid #eee" }}
    >
      <label style={{ cursor: "pointer", marginRight: 6 }} title={attachments.length > 0 ? attachments[0].fileName : "Добавить файл"}>
        <span style={{ fontSize: 22, color: uploading || attachments.length > 0 ? "#15a373" : "#999" }}>+</span>
        <input type="file" style={{ display: "none" }} onChange={handleFileChange} disabled={uploading} />
      </label>
      <input
        type="text"
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        placeholder="Напишите сообщение..."
        className="input-field"
        aria-label="Message"
        autoComplete="off"
        style={{ flex: 1, fontSize: 16, padding: "7px 12px", borderRadius: 12, border: "1px solid #ddd" }}
      />
      <button
        type="submit"
        className="send-btn"
        aria-label="Отправить"
        style={{ fontSize: 20, background: "#10a37f", color: "white", border: "none", borderRadius: "50%", width: 38, height: 38, marginLeft: 6, cursor: "pointer" }}
        disabled={uploading}
      >
        7a4
      </button>
      {attachments.length > 0 && (
        <div
          style={{
            marginLeft: 8,
            display: "flex",
            alignItems: "center",
            gap: 5,
            background: "#fcfcfc",
            border: "1px solid #eee",
            borderRadius: 8,
            padding: "4px 8px",
            maxWidth: 180,
          }}
        >
          {attachments[0].mimeType.startsWith("image/") ? (
            <img
              src={attachments[0].blobUrl}
              alt="preview"
              style={{ maxWidth: 36, maxHeight: 28, borderRadius: 4 }}
            />
          ) : (
            <>
              <span role="img" aria-label="file">4CE</span>
              <span
                style={{
                  fontSize: 13,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  maxWidth: 70,
                }}
              >
                {attachments[0].fileName}
              </span>
            </>
          )}
          <span
            style={{ cursor: "pointer", color: "#e00", fontWeight: 700, marginLeft: 3 }}
            onClick={handleRemoveAttachment}
            title="Удалить файл"
          >
            &times;
          </span>
        </div>
      )}
    </form>
  );
}
