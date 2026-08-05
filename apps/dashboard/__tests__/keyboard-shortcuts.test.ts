import { describe, expect, it, vi } from "vitest";

describe("Reviewer Keyboard Shortcuts Logic", () => {
  function createKeyboardHandler(
    onAccept: () => void,
    onCorrect: () => void,
    onRequestRecapture: () => void,
    onPhysicalInspection: () => void,
    onReturnToQueue: () => void,
    disabled = false
  ) {
    return (event: {
      key: string;
      ctrlKey?: boolean;
      altKey?: boolean;
      metaKey?: boolean;
      preventDefault?: () => void;
      targetIsEditable?: boolean;
    }) => {
      if (disabled || event.targetIsEditable) return;
      if (event.ctrlKey || event.altKey || event.metaKey) return;

      const key = event.key.toLowerCase();
      switch (key) {
        case "a":
          onAccept();
          break;
        case "c":
          onCorrect();
          break;
        case "r":
          onRequestRecapture();
          break;
        case "p":
          onPhysicalInspection();
          break;
        case "q":
        case "escape":
          onReturnToQueue();
          break;
        default:
          break;
      }
    };
  }

  it("triggers onAccept when 'a' key is pressed", () => {
    const onAccept = vi.fn();
    const handler = createKeyboardHandler(onAccept, vi.fn(), vi.fn(), vi.fn(), vi.fn());
    handler({ key: "a" });
    expect(onAccept).toHaveBeenCalledOnce();
  });

  it("triggers onCorrect when 'C' (uppercase) key is pressed", () => {
    const onCorrect = vi.fn();
    const handler = createKeyboardHandler(vi.fn(), onCorrect, vi.fn(), vi.fn(), vi.fn());
    handler({ key: "C" });
    expect(onCorrect).toHaveBeenCalledOnce();
  });

  it("triggers onReturnToQueue when Escape or Q key is pressed", () => {
    const onReturn = vi.fn();
    const handler = createKeyboardHandler(vi.fn(), vi.fn(), vi.fn(), vi.fn(), onReturn);
    handler({ key: "Escape" });
    handler({ key: "q" });
    expect(onReturn).toHaveBeenCalledTimes(2);
  });

  it("ignores hotkeys when user is typing inside an editable input field", () => {
    const onAccept = vi.fn();
    const handler = createKeyboardHandler(onAccept, vi.fn(), vi.fn(), vi.fn(), vi.fn());
    handler({ key: "a", targetIsEditable: true });
    expect(onAccept).not.toHaveBeenCalled();
  });

  it("ignores hotkeys when disabled (e.g. during pending API mutation)", () => {
    const onAccept = vi.fn();
    const handler = createKeyboardHandler(onAccept, vi.fn(), vi.fn(), vi.fn(), vi.fn(), true);
    handler({ key: "a" });
    expect(onAccept).not.toHaveBeenCalled();
  });
});
