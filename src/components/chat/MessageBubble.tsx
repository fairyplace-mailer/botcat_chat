import React from "react";
import Image from "next/image";

interface MessageBubbleProps {
  author: "bot" | "user";
  text: string;
  avatarUrl?: string;
  imgBase64?: string;
  fileName?: string;
}

export default function MessageBubble({ author, text, avatarUrl, imgBase64, fileName }: MessageBubbleProps) {
  return (
    <div className={`message-bubble ${author}`}>      
      <div className="bubble-row">
        {author === "bot" && (
          <Image
            src={avatarUrl || "/BotCat_Portrait.png"}
            alt="Avatar"
            className="bubble-avatar"
            width={32}
            height={32}
          />
        )}
        <div className="bubble-content">
          <div className="bubble-text">{text}</div>
          {imgBase64 && (
            <img
              src={imgBase64}
              alt="image reply"
              className="bubble-img"
              style={{ maxWidth: 240, maxHeight: 180, borderRadius: 16 }}
            />
          )}
          {fileName && (
            <div className="file-attachment">📎 {fileName}</div>
          )}
        </div>
        {author === "user" && (
          <Image
            src={avatarUrl || "/user.svg"}
            alt="User avatar"
            className="bubble-avatar user"
            width={32}
            height={32}
          />
        )}
      </div>
    </div>
  );
}
