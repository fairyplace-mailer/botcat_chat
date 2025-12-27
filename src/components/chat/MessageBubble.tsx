import React from "react";
import type { BotCatAttachment } from "../../lib/botcat-attachment";

interface MessageBubbleProps {
  author: string;
  text: string;
  attachments: BotCatAttachment[];
}

const MessageBubble: React.FC<MessageBubbleProps> = ({ author, text, attachments }) => {
  return (
    <div className={`message-bubble message-bubble-${author}`}>
      <div className="message-text" style={{ textAlign: "left", direction: "ltr" }}>
        {text}
      </div>

      {attachments && attachments.length > 0 && (
        <div className="attachments-list">
          {attachments.map((att) => {
            const key = att.attachmentId;

            const href = att.blobUrlOriginal ?? att.originalUrl ?? undefined;

            if (att.mimeType?.startsWith("image/")) {
              const src = att.blobUrlPreview ?? att.blobUrlOriginal ?? att.originalUrl ?? null;
              if (!src) return null;

              return (
                <a
                  key={key}
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="attachment-image"
                >
                  <img src={src} alt={att.fileName ?? "attachment preview"} loading="lazy" />
                </a>
              );
            }

            return (
              <a
                key={key}
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="attachment-file"
              >
                {att.fileName ?? "File"}
              </a>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default MessageBubble;
