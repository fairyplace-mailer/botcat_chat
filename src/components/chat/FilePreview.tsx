import React from "react";

export default function FilePreview({ file, onClear }: { file: File; onClear: () => void }) {
  return (
    <div className="file-preview">
      <span className="file-name">{file.name}</span>
      <button type="button" className="clear-file" onClick={onClear}>
        ✕
      </button>
    </div>
  );
}
