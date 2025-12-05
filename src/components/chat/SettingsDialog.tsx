import React, { useState } from "react";

export default function SettingsDialog({ onClose }: { onClose: () => void }) {
  const [theme, setTheme] = useState("system");
  const [notifications, setNotifications] = useState(false);

  return (
    <div className="dialog-overlay" role="dialog" aria-modal>
      <div className="dialog">
        <h2>Settings</h2>
        <div className="dialog-body">
          <div className="setting-row">
            <label htmlFor="theme">Theme:</label>
            <select id="theme" value={theme} onChange={e => setTheme(e.target.value)}>
              <option value="system">System</option>
              <option value="light">Light</option>
              <option value="dark">Dark</option>
            </select>
          </div>
          <div className="setting-row">
            <label>
              <input type="checkbox" checked={notifications} onChange={e => setNotifications(e.target.checked)} />
              Enable notifications
            </label>
          </div>
          <button className="clear-chat-btn" onClick={() => alert("Clear chat not implemented in mock.")}>Clear chat</button>
        </div>
        <button className="dialog-close" onClick={onClose}>Close</button>
      </div>
    </div>
  );
}
