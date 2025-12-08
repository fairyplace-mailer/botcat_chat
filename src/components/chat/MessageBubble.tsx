import React from "react";
import type { BotCatAttachment } from "../../lib/botcat-attachment";

interface MessageBubbleProps {
  author: string;
  text: string;
  attachments: BotCatAttachment[];
}

const MessageBubble: React.FC<MessageBubbleProps> = ({ author, text, attachments }) => {
  return (
    <div className={`message-bubble message-bubble-${author}`.toLowerCase()}>
      <div className="message-text">{text}</div>
      {attachments && attachments.length > 0 && (
        <div className="attachments-list">
          {attachments.map((att) => {
            if (att.mimeType?.startsWith("image/")) {
              return att.blobUrlPreview ? (
                <a
                  key={att.attachmentId}
                  href={att.blobUrlOriginal ?? att.originalUrl ?? undefined}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <img src={att.blobUrlPreview ?? undefined} alt="attachment preview" />
                </a>
              ) : null;
            } else {
              return (
                <a
                  key={att.attachmentId}
                  href={att.blobUrlOriginal ?? att.originalUrl ?? undefined}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {att.fileName ?? "Файл"}
                </a>
              );
            }
          })}
        </div>
      )}
    </div>
  );
};

export default MessageBubble;
