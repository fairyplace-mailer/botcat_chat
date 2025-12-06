"use client";
import React, { useState } from "react";
import ChatWindow, { Message } from "../components/chat/ChatWindow";
import MessageInput from "../components/chat/MessageInput";

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isTyping, setIsTyping] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function sendMessage({ message }: { message: string }) {
    setError(null);
    setIsTyping(true);
    const token = process.env.NEXT_PUBLIC_ACCESS_TOKEN || "";

    try {
      const formData = new FormData();
      formData.append("message", message);

      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "X-Access-Token": token,
        },
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`Error ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();

      setMessages(prev => [...prev, { author: "user", text: message }, { author: "bot", text: data.reply }]);
    } catch (e: any) {
      setError(e.message || "Unknown error");
    } finally {
      setIsTyping(false);
    }
  }

  function handleNewChat() {
    setMessages([]);
    setError(null);
  }

  return (
    <main className="chat-page" style={{ display: "flex", flexDirection: "column", height: "100vh" }}>
      <div style={{ padding: "10px", borderBottom: "1px solid #eee", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1 style={{ margin: 0, fontWeight: 600, fontSize: "1.25rem" }}>BotCat Chat</h1>
        <button onClick={handleNewChat} style={{ backgroundColor: "#10a37f", color: "white", border: "none", borderRadius: "5px", padding: "6px 12px", cursor: "pointer" }}>
          Новый диалог
        </button>
      </div>
      <ChatWindow messages={messages} isTyping={isTyping} />
      {error && <div className="chat-error" role="alert" style={{ color: "red", padding: "8px", textAlign: "center" }}>{error}</div>}
      <MessageInput onSend={sendMessage} />
    </main>
  );
}
