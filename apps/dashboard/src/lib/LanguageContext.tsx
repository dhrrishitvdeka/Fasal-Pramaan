"use client";

import React, { createContext, useContext, useState, useEffect } from "react";
import { parseAppLang, persistAppLang } from "./live-indian-languages";
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

const STORAGE_KEYS = ["fasal_lang", "fp_farmer_lang_v1"];

function readStoredLang(): Lang {
  if (typeof window === "undefined") return "en";
  try {
    const raw = localStorage.getItem("fasal_lang") || localStorage.getItem("fp_farmer_lang_v1");
    return persistAppLang(raw, "en");
  } catch {
    // ignore
  }
  return "en";
}

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>(readStoredLang);

  useEffect(() => {
    const handleSync = (e: Event) => {
      const custom = e as CustomEvent<string>;
      const next = parseAppLang(custom.detail || localStorage.getItem("fasal_lang") || localStorage.getItem("fp_farmer_lang_v1"));
      if (next && next !== lang) {
        setLangState(next);
      }
    };

    window.addEventListener("fasal:lang-change", handleSync);
    window.addEventListener("storage", handleSync);
    return () => {
      window.removeEventListener("fasal:lang-change", handleSync);
      window.removeEventListener("storage", handleSync);
    };
  }, [lang]);

  const setLang = (newLang: Lang) => {
    const next = parseAppLang(newLang);
    if (!next) return;
    setLangState(next);
    try {
      STORAGE_KEYS.forEach((k) => localStorage.setItem(k, next));
      window.dispatchEvent(new CustomEvent("fasal:lang-change", { detail: next }));
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
