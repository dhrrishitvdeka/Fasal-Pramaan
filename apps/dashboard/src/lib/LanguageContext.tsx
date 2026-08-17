"use client";

import React, { createContext, useContext, useState } from "react";
import { Lang, DictKey, t as translate } from "./i18n";

interface LanguageContextType {
  lang: Lang;
  setLang: (lang: Lang) => void;
  toggleLang: () => void;
  t: (key: DictKey) => string;
}

const LanguageContext = createContext<LanguageContextType>({
  lang: "en",
  setLang: () => {},
  toggleLang: () => {},
  t: (key: DictKey) => translate("en", key),
});

function readStoredLang(): Lang {
  if (typeof window === "undefined") return "en";
  try {
    const saved = localStorage.getItem("fasal_lang") as Lang;
    if (saved === "en" || saved === "hi") return saved;
  } catch {
    // ignore
  }
  return "en";
}

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>(readStoredLang);

  const setLang = (newLang: Lang) => {
    setLangState(newLang);
    try {
      localStorage.setItem("fasal_lang", newLang);
    } catch {}
  };

  const toggleLang = () => {
    setLang(lang === "en" ? "hi" : "en");
  };

  const t = (key: DictKey) => translate(lang, key);

  return (
    <LanguageContext.Provider value={{ lang, setLang, toggleLang, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  return useContext(LanguageContext);
}
