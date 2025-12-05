export default function ChatWindow() {
  // Пока только заглушка, далее — полноценная реализация чата
  return (
    <div style={{ minHeight: '80vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: '#fff', borderRadius: 16, boxShadow: '0 2px 16px #0002', padding: 32, minWidth: 320 }}>
        <h2 style={{ marginBottom: 16 }}>BotCat Chat</h2>
        <p style={{ color: '#666', fontSize: 18 }}>
          Здесь появится чат в стиле современного мессенджера
        </p>
      </div>
    </div>
  );
}
