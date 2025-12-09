"use client";
import Image from "next/image";
import React, { useState } from "react";

export default function Home() {
  // В дальнейшем сюда добавится стэйт сообщений, sidebar, реальный чат и т.д.
  const [_, setStub] = useState(false);

  return (
    <div
      className="min-h-screen bg-background flex text-foreground transition-colors duration-300"
    >
      {/* Sidebar placeholder */}
      <aside className="hidden md:flex flex-col gap-2 w-[260px] bg-muted border-r border-border py-5 px-4">
        {/* Логотип */}
        <div className="flex flex-col items-center mb-8 select-none">
          <Image
            src="/BotCat_Portrait.png"
            alt="BotCat Consultant Logo"
            width={72}
            height={72}
            className="rounded-full shadow border border-border bg-background"
            draggable={false}
            priority
          />
          <span className="mt-3 text-lg font-bold tracking-tight text-primary uppercase select-none">
            BotCat™
          </span>
          <span className="text-[0.89rem] tracking-wide text-muted-foreground font-medium">
            Consultant
          </span>
        </div>
        <button
          type="button"
          className="w-full py-2 rounded-lg bg-primary text-primary-foreground shadow hover:bg-accent hover:text-accent-foreground transition"
        >
          New Chat
        </button>
        {/* В будущем список чатов/настройки */}
      </aside>
      {/* Центр с чатом */}
      <div className="flex-1 flex flex-col items-stretch h-screen">
        {/* Верхний бар только на мобильных - фирменный стиль */}
        <header className="md:hidden flex items-center justify-between h-14 px-2 border-b border-border bg-muted/80 backdrop-blur sticky top-0 z-20">
          <span className="flex items-center gap-2 font-bold text-primary text-base">
            <Image src="/BotCat_Portrait.png" alt="BotCat Logo" width={32} height={32} className="rounded" />
            BotCat™
          </span>
          <button
            type="button"
            className="rounded-md bg-primary text-primary-foreground px-3 py-1.5 font-medium hover:bg-accent hover:text-accent-foreground"
          >
            New Chat
          </button>
        </header>
        {/* Центрированный приветственный экран */}
        <main className="flex-1 flex flex-col justify-center items-center">
          <Image
            src="/BotCat_Portrait.png"
            alt="BotCat Logo Large"
            width={88}
            height={88}
            className="rounded-full border border-border mb-3 shadow-lg bg-background"
            draggable={false}
            priority
          />
          <h1 className="text-2xl md:text-3xl font-bold mt-1 mb-2 select-none tracking-tight">
            Welcome to BotCat™ Consultant
          </h1>
          <p className="text-muted-foreground text-base md:text-lg max-w-xl text-center mb-6">
            Your private, AI-powered assistant for business, creativity and life.<br />
            Start a new chat to explore all BotCat™ features or continue your previous conversations.
          </p>
          <button
            type="button"
            className="mt-2 px-6 py-3 rounded-lg bg-primary text-primary-foreground shadow hover:bg-accent hover:text-accent-foreground transition text-lg font-semibold"
          >
            New Chat
          </button>
        </main>
      </div>
    </div>
  );
}
