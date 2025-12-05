// "use client";

import React, { useState, useCallback } from "react";
import ChatHeader from "../../components/chat/ChatHeader";
import ChatWindow from "../../components/chat/ChatWindow";
import MessageInput from "../../components/chat/MessageInput";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
}

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isTyping, setIsTyping] = useState(false);
  const [loading, setLoading] = useState(false);

  // Функция отправки сообщения
  const sendMessage = useCallback(async (text: string, file?: File) => {
    if (loading) return;
    setLoading(true);
    setIsTyping(true);

    const formData = new FormData();
    formData.append("message", text);
    if (file) formData.append("file", file);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        body: formData,
      });
      if (!res.ok) throw new Error("Ошибка сети");

      const data = await res.json();
      // Если API возвращает сообщение, то добавляем его, иначе ничего не добавляем
      if (data.message) {
        setMessages((prev) => [...prev, data.message]);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
      setIsTyping(false);
    }
  }, [loading]);

  return (
    <div className="flex flex-col h-screen max-w-3xl mx-auto border rounded shadow">
      {/* Убираем title, так как ChatHeader не принимает title prop */}
      <ChatHeader />
      <ChatWindow messages={messages} isTyping={isTyping} />
      <MessageInput onSend={sendMessage} disabled={loading} />
    </div>
  );
}
