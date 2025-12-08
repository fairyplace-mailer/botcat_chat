import React from 'react';
import { BotCatAttachment } from '../../lib/botcat-attachment';

interface MessageBubbleProps {
  author: string;
  text: string;
  attachments: BotCatAttachment[];
}

const MessageBubble: React.FC<MessageBubbleProps> = ({ author, text, attachments }) => {
  return (
    <div className="message-bubble">
      <div className="message-content">
        <p><strong>{author}:</strong> {text}</p>
      </div>
      {attachments && attachments.length > 0 && (
        <div className="attachments-list">
          {attachments.map((att) => {
            // Check for image attachments safely using optional chaining
            if (att.mimeType?.startsWith("image/")) {
              return att.blobUrlPreview ? (
                <a key={att.attachmentId} href={att.blobUrlOriginal || att.originalUrl} target="_blank" rel="noopener noreferrer">
                  <img src={att.blobUrlPreview} alt="attachment preview" />
                </a>
              ) : null;
            } else {
              // For non-image attachments, show a link with the file name
              return (
                <div key={att.attachmentId} className="non-image-attachment">
                  <a href={att.originalUrl} target="_blank" rel="noopener noreferrer">
                    {att.fileName || 'Download file'}
                  </a>
                </div>
              );
            }
          })}
        </div>
      )}
    </div>
  );
};

export default MessageBubble;
