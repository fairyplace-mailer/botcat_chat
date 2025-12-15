"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import ChatWindow, { Message } from "@/components/chat/ChatWindow";
import MessageInput, { MessageInputData } from "@/components/chat/MessageInput";
import Image from "next/image";

type SseMetaEvent = {
  ok: true;
  chatName: string;
  model: string;
  userMessageId: string;
};

type SseDeltaEvent = {
  delta: string;
};

type SseFinalEvent = {
  ok: true;
  chatName: string;
  model: string;
  botMessageId: string;
  reply: string;
};

type SseErrorEvent = {
  ok: false;
  error: string;
};

function parseSse(streamText: string) {
  // Minimal SSE parser. Expected frames look like:
  // event: meta\n
  // data: {...json...}\n
  // \n
  const messages: Array<{ event: string; data: any }> = [];
  const chunks = streamText.split("\n\n");
  for (const chunk of chunks) {
    if (!chunk.trim()) continue;
    const lines = chunk.split("\n");
    let event = "message";
    let dataLine = "";
    for (const line of lines) {
      if (line.startsWith("event:")) event = line.slice("event:".length).trim();
      if (line.startsWith("data:")) dataLine += line.slice("data:".length).trim();
    }
    if (!dataLine) continue;
    try {
      messages.push({ event, data: JSON.parse(dataLine) });
    } catch {
      // ignore malformed
    }
  }
  return messages;
}

export default function ChatV1Page() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isTyping, setIsTyping] = useState(false);
  const [chatName, setChatName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const scrollAnchorRef = useRef<HTMLDivElement | null>(null);

  const hasConversation = messages.length > 0;

  useEffect(() => {
    scrollAnchorRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, isTyping]);

  function resetChat() {
    abortRef.current?.abort();
    abortRef.current = null;
    setMessages([]);
    setIsTyping(false);
    setChatName(null);
    setError(null);
  }

  async function onSend(data: MessageInputData) {
    setError(null);

    // optimistic add user message
    setMessages((prev) => [
      ...prev,
      {
        author: "user",
        text: data.message,
        attachments: data.attachments ?? [],
      },
    ]);

    // placeholder bot message (we will stream into it)
    setMessages((prev) => [
      ...prev,
      {
        author: "bot",
        text: "",
        attachments: [],
      },
    ]);

    setIsTyping(true);

    const ac = new AbortController();
    abortRef.current = ac;

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chatName,
          message: data.message,
          attachments: data.attachments ?? [],
          client: {
            sessionId: "ui-memory",
            userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "unknown",
            ipHash: null,
          },
        }),
        signal: ac.signal,
      });

      if (!res.ok || !res.body) {
        setIsTyping(false);
        setError("Failed to send message");
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        // process complete SSE frames when we have a \n\n
        const parts = buffer.split("\n\n");
        buffer = parts.pop() ?? "";
        for (const part of parts) {
          const parsed = parseSse(part + "\n\n");
          for (const msg of parsed) {
            if (msg.event === "meta") {
              const meta = msg.data as SseMetaEvent;
              if (meta?.chatName) setChatName(meta.chatName);
            }
            if (msg.event === "delta") {
              const d = msg.data as SseDeltaEvent;
              const delta = d?.delta ?? "";
              if (!delta) continue;
              setMessages((prev) => {
                const next = [...prev];
                // last message must be bot placeholder
                for (let i = next.length - 1; i >= 0; i--) {
                  if (next[i].author === "bot") {
                    next[i] = { ...next[i], text: next[i].text + delta };
                    break;
                  }
                }
                return next;
              });
            }
            if (msg.event === "final") {
              const fin = msg.data as SseFinalEvent;
              if (fin?.chatName) setChatName(fin.chatName);
              // ensure last bot message is set to final reply
              setMessages((prev) => {
                const next = [...prev];
                for (let i = next.length - 1; i >= 0; i--) {
                  if (next[i].author === "bot") {
                    next[i] = { ...next[i], text: fin.reply ?? next[i].text };
                    break;
                  }
                }
                return next;
              });
              setIsTyping(false);
            }
            if (msg.event === "error") {
              const err = msg.data as SseErrorEvent;
              setError(err?.error || "Server error");
              setIsTyping(false);
            }
          }
        }
      }

      setIsTyping(false);
    } catch (e: any) {
      if (e?.name === "AbortError") return;
      setIsTyping(false);
      setError("Network error");
    } finally {
      abortRef.current = null;
    }
  }

  const headerTitle = useMemo(() => {
    if (!hasConversation) return "BotCat Consultant v1.0";
    return chatName ? `Chat: ${chatName}` : "Chat";
  }, [chatName, hasConversation]);

  return (
    <div className="min-h-screen bg-background flex">
      {/* Sidebar (desktop only) */}
      <aside className="w-64 bg-muted border-r border-border hidden md:flex flex-col">
        <div className="p-4 flex items-center justify-center">
          <Image src="/BotCat_Portrait.png" alt="BotCat" width={48} height={48} />
        </div>

        <button
          className="m-4 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition"
          onClick={resetChat}
          disabled={isTyping}
        >
          New Chat
        </button>

        <div className="flex-1 p-4 overflow-auto">
          <p className="text-muted-foreground">One chat (in-memory)</p>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 flex flex-col">
        <header className="p-4 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="md:hidden">
              <Image src="/BotCat_Portrait.png" alt="BotCat" width={32} height={32} />
            </div>
            <h1 className="text-xl font-bold text-foreground">{headerTitle}</h1>
          </div>

          <button
            className="md:hidden px-3 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition"
            onClick={resetChat}
            disabled={isTyping}
          >
            New Chat
          </button>
        </header>

        <div className="flex-1 overflow-hidden flex flex-col">
          <div className="flex-1 overflow-auto">
            {!hasConversation ? (
              <div className="p-6 text-muted-foreground">
                Ask BotCat about design. Your chat is stored only in this page memory.
              </div>
            ) : null}
            <ChatWindow messages={messages} isTyping={isTyping} />
            <div ref={scrollAnchorRef} />
          </div>

          <footer className="p-4 border-t border-border">
            {error ? <div className="mb-2 text-red-600 text-sm">{error}</div> : null}
            <MessageInput onSend={onSend} disabled={false} loading={isTyping} />
          </footer>
        </div>
      </main>
    </div>
  );
}
