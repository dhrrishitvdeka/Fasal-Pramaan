"use client";

import React, { useEffect, useState } from "react";

export interface ReviewKeyboardShortcutsProps {
  onAccept: () => void;
  onCorrect: () => void;
  onRequestRecapture: () => void;
  onPhysicalInspection: () => void;
  onReject?: () => void;
  onReturnToQueue: () => void;
  disabled?: boolean;
}

export function ReviewKeyboardShortcuts({
  onAccept,
  onCorrect,
  onRequestRecapture,
  onPhysicalInspection,
  onReject,
  onReturnToQueue,
  disabled = false,
}: ReviewKeyboardShortcutsProps) {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (disabled) return;

      // Ignore hotkeys when typing in editable inputs, textareas, or selects
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable)
      ) {
        return;
      }

      // Ignore if modifier keys are pressed (e.g. Ctrl+C, Cmd+R)
      if (event.ctrlKey || event.altKey || event.metaKey) {
        return;
      }

      const key = event.key.toLowerCase();

      switch (key) {
        case "a":
          event.preventDefault();
          onAccept();
          break;
        case "c":
          event.preventDefault();
          onCorrect();
          break;
        case "r":
          event.preventDefault();
          onRequestRecapture();
          break;
        case "p":
          event.preventDefault();
          onPhysicalInspection();
          break;
        case "x":
          event.preventDefault();
          onReject?.();
          break;
        case "q":
        case "escape":
          event.preventDefault();
          onReturnToQueue();
          break;
        case "?":
          event.preventDefault();
          setIsOpen((prev) => !prev);
          break;
        default:
          break;
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onAccept, onCorrect, onRequestRecapture, onPhysicalInspection, onReject, onReturnToQueue, disabled]);

  return (
    <>
      {/* Keyboard Shortcuts Trigger Button */}
      <button
        type="button"
        className="hidden items-center gap-1.5 rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 hover:text-slate-900 md:inline-flex"
        onClick={() => setIsOpen(true)}
        title="View keyboard shortcuts (Press '?')"
      >
        <span className="text-sm">⌨️</span>
        <span>Shortcuts</span>
        <kbd className="rounded border border-slate-200 bg-slate-100 px-1 font-mono text-[10px] text-slate-500">
          ?
        </kbd>
      </button>

      {/* Modal Cheat-Sheet Dialog */}
      {isOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm"
          onClick={() => setIsOpen(false)}
        >
            <div
              className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-xl transition-all"
              onClick={(e) => e.stopPropagation()}
            >
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <span className="text-base">⌨️</span>
                <h3 className="text-sm font-semibold text-slate-900">
                  Reviewer Keyboard Shortcuts
                </h3>
              </div>
              <button
                type="button"
                className="flex min-h-11 min-w-11 items-center justify-center rounded text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                onClick={() => setIsOpen(false)}
                aria-label="Close shortcuts"
              >
                ✕
              </button>
            </div>

            <p className="mt-2 text-xs text-slate-500">
              Use these rapid hotkeys to process reviewer decisions faster. Hotkeys are disabled while typing in text inputs.
            </p>

            <div className="mt-4 space-y-2 text-xs">
              <div className="flex items-center justify-between rounded border border-slate-100 bg-slate-50 p-2">
                <span className="text-slate-700">Accept AI Screening Result</span>
                <kbd className="rounded border border-slate-300 bg-white px-2 py-0.5 font-mono text-xs font-bold text-slate-800 shadow-sm">
                  A
                </kbd>
              </div>

              <div className="flex items-center justify-between rounded border border-slate-100 bg-slate-50 p-2">
                <span className="text-slate-700">Correct & Verify Assessment</span>
                <kbd className="rounded border border-slate-300 bg-white px-2 py-0.5 font-mono text-xs font-bold text-slate-800 shadow-sm">
                  C
                </kbd>
              </div>

              <div className="flex items-center justify-between rounded border border-slate-100 bg-slate-50 p-2">
                <span className="text-slate-700">Request Recapture from Field</span>
                <kbd className="rounded border border-slate-300 bg-white px-2 py-0.5 font-mono text-xs font-bold text-slate-800 shadow-sm">
                  R
                </kbd>
              </div>

              <div className="flex items-center justify-between rounded border border-slate-100 bg-slate-50 p-2">
                <span className="text-slate-700">Order Physical Inspection</span>
                <kbd className="rounded border border-slate-300 bg-white px-2 py-0.5 font-mono text-xs font-bold text-slate-800 shadow-sm">
                  P
                </kbd>
              </div>

              <div className="flex items-center justify-between rounded border border-slate-100 bg-slate-50 p-2">
                <span className="text-slate-700">Reject Claim (reason required)</span>
                <kbd className="rounded border border-slate-300 bg-white px-2 py-0.5 font-mono text-xs font-bold text-slate-800 shadow-sm">
                  X
                </kbd>
              </div>

              <div className="flex items-center justify-between rounded border border-slate-100 bg-slate-50 p-2">
                <span className="text-slate-700">Return to Review Queue</span>
                <div className="flex gap-1">
                  <kbd className="rounded border border-slate-300 bg-white px-1.5 py-0.5 font-mono text-xs font-bold text-slate-800 shadow-sm">
                    Esc
                  </kbd>
                  <kbd className="rounded border border-slate-300 bg-white px-1.5 py-0.5 font-mono text-xs font-bold text-slate-800 shadow-sm">
                    Q
                  </kbd>
                </div>
              </div>

              <div className="flex items-center justify-between rounded border border-slate-100 bg-slate-50 p-2">
                <span className="text-slate-700">Toggle Shortcuts Guide</span>
                <kbd className="rounded border border-slate-300 bg-white px-2 py-0.5 font-mono text-xs font-bold text-slate-800 shadow-sm">
                  ?
                </kbd>
              </div>
            </div>

            <div className="mt-5 flex justify-end">
              <button
                type="button"
                className="fp-btn-secondary"
                onClick={() => setIsOpen(false)}
              >
                Close (Esc)
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
