"use client";

import { useEffect } from "react";

/**
 * Registers /sw.js in production only. Dev is left untouched so HMR and
 * Fast Refresh never fight a service worker for requests.
 */
export default function PwaRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;
    const register = () => {
      try {
        navigator.serviceWorker.register("/sw.js").catch((error) => {
          // Gracefully suppress SecurityError / insecure DOMException thrown in private browsing or restricted browser contexts
          const msg = error instanceof Error ? error.message : String(error);
          const name = (error as { name?: string })?.name;
          if (name === "SecurityError" || /insecure|security/i.test(msg)) {
            return;
          }
          console.warn("[pwa] service worker registration failed:", error);
        });
      } catch {
        // Suppress synchronous browser security access errors
      }
    };
    if (document.readyState === "complete") {
      register();
    } else {
      window.addEventListener("load", register, { once: true });
    }
  }, []);

  return null;
}
