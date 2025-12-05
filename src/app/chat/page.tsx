"use client";

import React, { useState, useEffect, useRef } from "react";
import ChatHeader from "../../components/chat/ChatHeader";
import ChatWindow, { Message } from "../../components/chat/ChatWindow";
import MessageInput from "../../components/chat/MessageInput";

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isTyping, setIsTyping] = useState(false);
  const [loading, setLoading] = useState(false);
  const chatContainerRef = useRef<HTMLDivElement>(null);

  // Автоскролл к последнему сообщению
  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [messages, isTyping]);

  // Обработка отправки сообщения или файла
  async function handleSend({ message, file }: { message: string; file?: File }) {
    if (!message.trim() && !file) return;
    setLoading(true);
    setIsTyping(true);
    let imgBase64: string | undefined = undefined;
    let fileName: string | undefined = undefined;

    // Если есть файл — читаем base64 и добавляем имя
    if (file) {
      fileName = file.name;
      const reader = new FileReader();
      imgBase64 = await new Promise<string | undefined>((resolve) => {
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => resolve(undefined);
        reader.readAsDataURL(file);
      });
    }

    // Добавляем сообщение пользователя сразу
    setMessages((prev) => [
      ...prev,
      { author: "user", text: message, imgBase64, fileName },
    ]);

    // Формируем payload
    const formData = new FormData();
    formData.append("message", message);
    if (file) formData.append("file", file);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        body: formData,
      });
      if (!res.ok) throw new Error("Network error");
      const data = await res.json();
      // Ответ чата должен соответствовать типу Message
      if (data && typeof data === "object" && data.reply) {
        const botMsg = data.reply;
        setMessages((prev) => [...prev, { author: "bot", ...botMsg }]);
      }
    } catch (err) {
      // Можно отобразить ошибку в UI или уведомлении
      // alert("Ошибка отправки сообщения");
    } finally {
      setLoading(false);
      setIsTyping(false);
    }
  }

  return (
    <div className="flex flex-col h-screen max-w-2xl mx-auto border rounded shadow bg-white">
      <ChatHeader />
      <div style={{ flex: 1, overflow: "hidden" }} ref={chatContainerRef}>
        <ChatWindow messages={messages} isTyping={isTyping} />
      </div>
      <MessageInput onSend={handleSend} />
    </div>
  );
}
