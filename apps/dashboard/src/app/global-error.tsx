"use client";

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          fontFamily: "'Segoe UI', system-ui, -apple-system, Roboto, Helvetica, Arial, sans-serif",
        }}
      >
        <div
          style={{
            minHeight: "100vh",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "1.5rem",
            background: "var(--canvas, #f3efe6)",
            color: "var(--ink, #1c1915)",
          }}
        >
          <div
            role="alert"
            style={{
              width: "100%",
              maxWidth: "26rem",
              padding: "2rem 1.5rem",
              textAlign: "center",
              background: "var(--surface, #fffcf6)",
              border: "1px solid var(--line, #d4cfc4)",
            }}
          >
            <h2 style={{ margin: 0, fontSize: "1rem", fontWeight: 600 }}>
              Something went wrong
            </h2>
            <p style={{ margin: "0.5rem 0 0", fontSize: "0.875rem", color: "var(--ink-muted, #5c574e)" }}>
              कुछ ग़लत हो गया। कृपया पुनः प्रयास करें।
            </p>
            {error.digest ? (
              <p style={{ marginTop: "0.75rem", fontSize: "11px", fontFamily: "monospace" }}>
                ref: {error.digest}
              </p>
            ) : null}
            <button
              type="button"
              onClick={reset}
              style={{
                marginTop: "1.25rem",
                padding: "0.5rem 1rem",
                fontSize: "0.875rem",
                fontWeight: 500,
                cursor: "pointer",
                background: "var(--ink, #1c1915)",
                color: "var(--surface, #fffcf6)",
                border: "1px solid var(--ink, #1c1915)",
              }}
            >
              Try again · पुनः प्रयास करें
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
