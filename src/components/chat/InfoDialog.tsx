import React from "react";

export default function InfoDialog({ onClose }: { onClose: () => void }) {
  return (
    <div className="dialog-overlay" role="dialog" aria-modal>
      <div className="dialog">
        <h2>About Botcat</h2>
        <img src="/BotCat_Portrait.png" alt="Bot avatar" style={{ width: 64, height: 64, borderRadius: 24, marginBottom: 12 }} />
        <div className="dialog-body">
          <p><b>Fairyplace Botcat</b></p>
          <p>Your helpful assistant for communication and file sharing.</p>
          <ul>
            <li>Version: 1.0.0 (2024-06-12)</li>
            <li>Upload images and files, preview bot images (base64), download transcripts as PDF.</li>
            <li>Markdown supported. PWA coming soon.</li>
            <li>Support: <a href="mailto:support@fairyplace.net">support@fairyplace.net</a></li>
            <li><a href="#">Privacy policy</a></li>
          </ul>
        </div>
        <button className="dialog-close" onClick={onClose}>Close</button>
      </div>
    </div>
  );
}
