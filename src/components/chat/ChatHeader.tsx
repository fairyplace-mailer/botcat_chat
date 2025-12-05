import React, { useState } from "react";
import Image from "next/image";
import InfoDialog from "./InfoDialog";
import SettingsDialog from "./SettingsDialog";
import LanguageSwitcher from "./LanguageSwitcher";

export default function ChatHeader({ onDownload }: { onDownload?: () => void }) {
  const [showInfo, setShowInfo] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  return (
    <header className="chat-header">
      <div className="chat-header-left">
        <Image
          src="/BotCat_Portrait.png"
          alt="BotCat bot avatar"
          width={40}
          height={40}
          className="bot-avatar"
        />
        <div className="chat-title-col">
          <span className="chat-title">Fairyplace Botcat</span>
          <span className="chat-subtitle">Your helpful assistant</span>
        </div>
      </div>
      <div className="chat-header-actions">
        <button
          aria-label="Info"
          className="header-action"
          onClick={() => setShowInfo(true)}
        >
          ℹ️
        </button>
        <button
          aria-label="Settings"
          className="header-action"
          onClick={() => setShowSettings(true)}
        >
          ⚙️
        </button>
        <button
          aria-label="Download chat as PDF"
          className="header-action"
          onClick={onDownload}
        >
          ⬇️ PDF
        </button>
        <LanguageSwitcher />
      </div>
      {showInfo && <InfoDialog onClose={() => setShowInfo(false)} />}
      {showSettings && <SettingsDialog onClose={() => setShowSettings(false)} />}
    </header>
  );
}
