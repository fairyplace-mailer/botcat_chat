"use client";

import React, { useMemo, useRef, useState } from "react";
import Link from "next/link";
import ChatWindow, { type Message as UIMessage } from "@/components/chat/ChatWindow";
import MessageInput, { type MessageInputData } from "@/components/chat/MessageInput";
import type { BotCatAttachment } from "@/lib/botcat-attachment";

export type ChatMessage = {
  id: string;
  role: "User" | "BotCat";
  content: string;
  attachments?: BotCatAttachment[];
  createdAt: number;
};

function getOrCreateSessionId(): string {
  const KEY = "botcat_session_id";
  try {
    const existing = window.localStorage.getItem(KEY);
    if (existing) return existing;
    const next = crypto.randomUUID();
    window.localStorage.setItem(KEY, next);
    return next;
  } catch {
    // If localStorage is unavailable (rare), fall back to an in-memory value.
    return crypto.randomUUID();
  }
}

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
    // SSE allows multiple `data:` lines per event.
    const dataLines: string[] = [];

    for (const l of lines) {
      if (l.startsWith("event:")) event = l.slice("event:".length).trim();
      if (l.startsWith("data:")) dataLines.push(l.slice("data:".length).trim());
    }

    if (dataLines.length === 0) continue;

    const dataStr = dataLines.join("\n");
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
    attachments: m.attachments ?? [],
  };
}

export default function ChatPage() {
  const TM = "\u2122";

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
    const extractedDocuments = data.extractedDocuments ?? [];

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
          extractedDocuments,
          client: {
            sessionId: getOrCreateSessionId(),
            userAgent: navigator.userAgent,
          },
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
    <main
      style={{
        minHeight: "100vh",
        background: "var(--bg)",
        padding: 24,
      }}
    >
      {/* Right-aligned container: 85% width, full height */}
      <div
        style={{
          width: "85vw",
          marginLeft: "auto",
          display: "flex",
          flexDirection: "column",
          height: "calc(100vh - 48px)",
          gap: 16,
        }}
      >
        {/* Header */}
        <header
          style={{
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: 12,
            padding: "12px 16px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
          }}
        >
          <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
            <div style={{ fontWeight: 700, color: "var(--text-primary)" }}>
              {`BotCat${TM} Instant (v1.0)`}
            </div>
            {chatName ? (
              <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>{chatName}</div>
            ) : null}
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <Link href="/" className="btn-secondary">
              Home
            </Link>
            <button type="button" onClick={newChat} disabled={!canReset || isStreaming} className="btn-primary">
              New Chat
            </button>
          </div>
        </header>

        {error ? (
          <div style={{ color: "#b00020", fontSize: 14 }}>Error: {error}</div>
        ) : null}

        {/* Chat area */}
        <section
          style={{
            flex: 1,
            minHeight: 0,
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: 12,
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
          }}
        >
          <div ref={listRef} style={{ flex: 1, minHeight: 0, overflow: "auto" }}>
            <ChatWindow messages={chatWindowMessages} isTyping={isStreaming} />
          </div>

          <div style={{ padding: 12, borderTop: "1px solid var(--border)" }}>
            <MessageInput onSend={sendToApi} disabled={isStreaming} loading={isStreaming} />
          </div>
        </section>
      </div>
    </main>
  );
}
