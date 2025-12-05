"use client";
import React, { useState, useEffect } from "react";
import ChatHeader from "../../components/chat/ChatHeader";
import ChatWindow, { Message } from "../../components/chat/ChatWindow";
import MessageInput from "../../components/chat/MessageInput";

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isTyping, setIsTyping] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function sendMessage({ message, file }: { message: string; file?: File }) {
    setError(null);
    setIsTyping(true);
    const token = process.env.NEXT_PUBLIC_ACCESS_TOKEN || "";

    try {
      const formData = new FormData();
      formData.append("message", message);
      if (file) {
        formData.append("file", file);
      }

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

  function handleDownload() {
    alert("Download chat as PDF not implemented yet.");
  }

  return (
    <main className="chat-page" style={{ display: "flex", flexDirection: "column", height: "100vh" }}>
      <ChatHeader onDownload={handleDownload} />
      <ChatWindow messages={messages} isTyping={isTyping} />
      {error && <div className="chat-error" role="alert" style={{ color: "red", padding: "8px", textAlign: "center" }}>{error}</div>}
      <MessageInput onSend={sendMessage} />
    </main>
  );
}
