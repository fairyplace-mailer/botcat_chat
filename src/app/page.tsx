import React from 'react';

export default function Page() {
  return (
    <div className="min-h-screen bg-background flex">
      {/* Sidebar */}
      <aside className="w-64 bg-muted border-r border-border hidden md:flex flex-col">
        <div className="p-4 flex items-center justify-center">
          <img src="/BotCat_Portrait.png" alt="BotCat Logo" className="h-12 w-12" />
        </div>
        <button className="m-4 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition">
          New Chat
        </button>
        <div className="flex-1 p-4 overflow-auto">
          {/* Chat list placeholder */}
          <p className="text-muted-foreground">No chats yet</p>
        </div>
      </aside>

      {/* Main chat area */}
      <main className="flex-1 flex flex-col">
        {/* Header */}
        <header className="p-4 border-b border-border flex items-center justify-between">
          <h1 className="text-2xl font-bold text-foreground">Chat</h1>
        </header>
        
        {/* Chat content */}
        <div className="flex-1 p-4 overflow-auto bg-background">
          <p className="text-muted-foreground">Welcome to BotCat Consultant v1.0</p>
          {/* Placeholder message bubbles */}
          <div className="mt-4 space-y-2">
            <div className="max-w-md bg-chat-bot-bg text-foreground p-3 rounded-lg">
              Hello, how can I help you?
            </div>
            <div className="max-w-md self-end bg-chat-user-bg text-primary-foreground p-3 rounded-lg">
              I need assistance with my project.
            </div>
          </div>
        </div>

        {/* Message input */}
        <footer className="p-4 border-t border-border">
          <form className="flex items-center space-x-2">
            <input
              type="text"
              placeholder="Type a message..."
              className="flex-1 px-3 py-2 border border-border rounded-lg bg-muted focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <button type="submit" className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition">
              Send
            </button>
          </form>
        </footer>
      </main>
    </div>
  );
}
