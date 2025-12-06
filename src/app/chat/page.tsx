import React, { useState } from 'react';

import ChatWindow, { Message } from "../components/chat/ChatWindow";
import MessageInput from "../components/chat/MessageInput";

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isTyping, setIsTyping] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Explicitly typing sendMessage to match (message: string) => Promise<void>
  const sendMessage: (message: string) => Promise<void> = async (message: string) => {
    // Clear any error
    setError(null);
    // Add the new message to the conversation
    const newMessage: Message = { id: Date.now(), text: message, sender: 'user' };
    setMessages(prev => [...prev, newMessage]);

    // Simulate bot response (placeholder)
    setIsTyping(true);
    try {
      // Here you could call backend API to get bot response
      await new Promise(resolve => setTimeout(resolve, 1000));
      const botMessage: Message = { id: Date.now() + 1, text: 'Ответ бота', sender: 'bot' };
      setMessages(prev => [...prev, botMessage]);
    } catch (err: any) {
      setError('Ошибка при отправке сообщения');
    } finally {
      setIsTyping(false);
    }
  };

  // Handler for "Новый диалог" button
  function handleNewDialog() {
    setMessages([]);
    setError(null);
  }

  return (
    <main style={{ maxWidth: '800px', margin: '0 auto', padding: '16px' }}>
      <ChatWindow messages={messages} isTyping={isTyping} />
      {error && (
        <div className="chat-error" role="alert" style={{ color: 'red', padding: '8px', textAlign: 'center' }}>
          {error}
        </div>
      )}
      <MessageInput onSend={sendMessage} />
      <button onClick={handleNewDialog} style={{ marginTop: '8px', padding: '8px 16px' }}>
        Новый диалог
      </button>
    </main>
  );
}
