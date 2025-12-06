"use client";
import React, { useState } from "react";
import ChatWindow, { Message } from "../components/chat/ChatWindow";
import MessageInput from "../components/chat/MessageInput";

export default function Home() {
  // --- 2. Минимальный стейт только для чата ---
  const [messages, setMessages] = useState<Message[]>([]);
  const [isTyping, setIsTyping] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Получить ответ бота
  async function sendMessage(message: string) {
    setError(null);
    setIsTyping(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ message }),
      });
      if (!res.ok) throw new Error("Ошибка сети");
      const data = await res.json();
      setMessages(prev => [
        ...prev,
        { author: "user", text: message },
        { author: "bot", text: data.reply }
      ]);
    } catch (e: any) {
      setError(e.message || "Произошла неизвестная ошибка");
    } finally {
      setIsTyping(false);
    }
  }

  // Новый диалог (очистка истории)
  function handleNewChat() {
    setMessages([]);
    setError(null);
  }

  // --- 3. Минималистичная разметка, стиль ChatGPT ---
  return (
    <main className="chat-page" style={{ display: "flex", flexDirection: "column", height: "100vh" }}>
      <div style={{ padding: "10px 12px", borderBottom: "1px solid #eee", display: "flex", justifyContent: "space-between", alignItems: "center", background: "#f8fafc" }}>
        <span style={{ fontWeight: 700, fontSize: 18, letterSpacing: 0.5 }}>BotCat Chat</span>
        <button onClick={handleNewChat} style={{ background: "#10a37f", color: "#fff", border: 0, borderRadius: 6, padding: "6px 14px", fontWeight: 600, cursor: "pointer" }}>
          Новый диалог
        </button>
      </div>
      <ChatWindow messages={messages} isTyping={isTyping} />
      {error && <div className="chat-error" role="alert" style={{ color: "#e00", background: "#fff5f5", padding: "8px", textAlign: "center" }}>{error}</div>}
      <div style={{ borderTop: "1px solid #eee", background: "#fcfcfd" }}>
        <MessageInput onSend={sendMessage} />
      </div>
    </main>
  );
}
