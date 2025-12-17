"use client";

import React, { useMemo, useRef, useState } from "react";
import ChatWindow, { type Message as UIMessage } from "@/components/chat/ChatWindow";
import MessageInput, { type MessageInputData } from "@/components/chat/MessageInput";

export type ChatMessage = {
  id: string;
  role: "User" | "BotCat";
  content: string;
  attachments?: MessageInputData["attachments"];
  createdAt: number;
};

function parseSSELineEvent(chunk: string) {
  // Minimal SSE parser for our simple protocol.
  // We only rely on: event: <name> and data: <json> separated by blank line.
  const blocks = chunk.split("\n\n");
  const events: Array<{ event?: string; data?: any }> = [];

  for (const block of blocks) {
    const lines = block
      .split("\n")
      .map((l) => l.trimEnd())
      .filter(Boolean);
    if (lines.length === 0) continue;

    let event: string | undefined;
    let dataStr: string | undefined;

    for (const l of lines) {
      if (l.startsWith("event:")) event = l.slice("event:".length).trim();
      if (l.startsWith("data:")) dataStr = l.slice("data:".length).trim();
    }

    if (!dataStr) continue;
    try {
      const data = JSON.parse(dataStr);
      events.push({ event, data });
    } catch {
      // ignore invalid json
    }
  }

  return events;
}

function toChatWindowMessage(m: ChatMessage): UIMessage {
  return {
    author: m.role === "User" ? "user" : "bot",
    text: m.content,
    attachments: (m.attachments ?? []) as any,
  };
}

export default function ChatPage() {
  const [chatName, setChatName] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const listRef = useRef<HTMLDivElement>(null);

  const canReset = useMemo(() => messages.length > 0 || chatName, [messages, chatName]);

  function newChat() {
    setChatName(null);
    setMessages([]);
    setError(null);
    setIsStreaming(false);
  }

  async function sendToApi(data: MessageInputData) {
    setError(null);

    const userText = data.message ?? "";
    const attachments = data.attachments ?? [];

    if (!userText.trim() && attachments.length === 0) return;

    const userMessageId = crypto.randomUUID();
    setMessages((prev) => [
      ...prev,
      {
        id: userMessageId,
        role: "User",
        content: userText,
        attachments,
        createdAt: Date.now(),
      },
      {
        id: "bot-stream",
        role: "BotCat",
        content: "",
        createdAt: Date.now(),
      },
    ]);

    setIsStreaming(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chatName,
          message: userText,
          attachments,
        }),
      });

      if (!res.ok || !res.body) {
        const text = await res.text().catch(() => "");
        throw new Error(text || `HTTP ${res.status}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let botText = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // Process full events when we have blank-line delimiter.
        if (!buffer.includes("\n\n")) continue;

        const parts = buffer.split("\n\n");
        buffer = parts.pop() ?? "";

        for (const part of parts) {
          const events = parseSSELineEvent(part + "\n\n");
          for (const e of events) {
            if (e.event === "meta") {
              if (e.data?.chatName) setChatName(e.data.chatName);
            }

            if (e.event === "delta") {
              const delta = typeof e.data?.delta === "string" ? e.data.delta : "";
              if (delta) {
                botText += delta;
                setMessages((prev) =>
                  prev.map((m) => (m.id === "bot-stream" ? { ...m, content: botText } : m))
                );
              }
            }

            if (e.event === "final") {
              const reply = typeof e.data?.reply === "string" ? e.data.reply : botText;
              botText = reply;
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === "bot-stream" ? { ...m, id: crypto.randomUUID(), content: reply } : m
                )
              );
            }

            if (e.event === "error") {
              throw new Error(e.data?.error || "Stream error");
            }
          }
        }
      }
    } catch (e: any) {
      setError(e?.message || "Failed to send message");
      // Remove bot placeholder if it never got content
      setMessages((prev) => prev.filter((m) => m.id !== "bot-stream"));
    } finally {
      setIsStreaming(false);
      // autoscroll
      requestAnimationFrame(() => {
        listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
      });
    }
  }

  const chatWindowMessages = useMemo(() => messages.map(toChatWindowMessage), [messages]);

  return (
    <main style={{ maxWidth: 900, margin: "0 auto", padding: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
        <h1 style={{ margin: 0 }}>FairyPlace BotCat (v1.0)</h1>
        <button type="button" onClick={newChat} disabled={!canReset || isStreaming}>
          New Chat
        </button>
      </div>

      {error ? <div style={{ marginTop: 12, color: "#b00020" }}>Error: {error}</div> : null}

      <div ref={listRef} style={{ height: "65vh", overflow: "auto", marginTop: 12 }}>
        <ChatWindow messages={chatWindowMessages} isTyping={isStreaming} />
      </div>

      <div style={{ marginTop: 12 }}>
        <MessageInput onSend={sendToApi} disabled={isStreaming} loading={isStreaming} />
      </div>
    </main>
  );
}
