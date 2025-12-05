import React, { useState } from "react";

export default function LanguageSwitcher() {
  const [lang, setLang] = useState("en");
  return (
    <button
      className="lang-switcher"
      aria-label="Switch language"
      title="Switch language"
      onClick={() => setLang(lang === "en" ? "ru" : "en")}
    >
      {lang === "en" ? "EN" : "RU"}
    </button>
  );
}
