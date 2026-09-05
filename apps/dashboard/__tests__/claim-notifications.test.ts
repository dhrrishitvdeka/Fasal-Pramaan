import { describe, expect, it, beforeEach, vi } from "vitest";
import {
  getLocalizedNotification,
  mapApiErrorToNotificationCode,
  notificationDebouncer,
  type NotificationCode,
} from "../src/lib/claim-notifications";
import { GEMINI_LIVE_INDIAN_LANGUAGE_CODES } from "../src/lib/live-indian-languages";

describe("claim-notifications", () => {
  beforeEach(() => {
    notificationDebouncer.clear();
  });

  it("provides valid localized notification content for all 15 Indian languages", () => {
    const codes: NotificationCode[] = [
      "invalid_session",
      "submission_failed",
      "duplicate_images",
      "unusable_lighting",
      "blurry_image",
      "no_plot_selected",
      "missing_angles",
      "draft_saved",
      "draft_save_failed",
      "photo_upload_failed",
      "camera_switched",
      "retake_cleared",
      "claim_submitted",
      "supabase_not_configured",
      "gps_unavailable",
      "voice_unavailable",
    ];

    for (const lang of GEMINI_LIVE_INDIAN_LANGUAGE_CODES) {
      for (const code of codes) {
        const notif = getLocalizedNotification(code, lang);
        expect(notif, `Notification ${code} in language ${lang} should exist`).toBeDefined();
        expect(notif.title.length, `Title for ${code} in ${lang} should not be empty`).toBeGreaterThan(0);
        expect(notif.message.length, `Message for ${code} in ${lang} should not be empty`).toBeGreaterThan(0);
        expect(["success", "warning", "error", "info"]).toContain(notif.type);
      }
    }
  });

  it("maps HTTP and API errors correctly to farmer-friendly notification codes", () => {
    expect(mapApiErrorToNotificationCode(401)).toBe("invalid_session");
    expect(mapApiErrorToNotificationCode(403)).toBe("invalid_session");
    expect(mapApiErrorToNotificationCode("Session expired, please re-authenticate")).toBe("invalid_session");

    expect(mapApiErrorToNotificationCode("Duplicate dHash detected across angles")).toBe("duplicate_images");
    expect(mapApiErrorToNotificationCode("Image lighting too dark (luma below threshold)")).toBe("unusable_lighting");
    expect(mapApiErrorToNotificationCode("High Laplacian motion blur score")).toBe("blurry_image");
    expect(mapApiErrorToNotificationCode("No registered plot selected for claim")).toBe("no_plot_selected");
    expect(mapApiErrorToNotificationCode("Storage full: quota exceeded in localStorage")).toBe("draft_save_failed");

    expect(mapApiErrorToNotificationCode(500, "Internal server error")).toBe("submission_failed");
    expect(mapApiErrorToNotificationCode(503, "Service unavailable")).toBe("submission_failed");
    expect(mapApiErrorToNotificationCode("Failed to fetch: network offline")).toBe("submission_failed");
  });

  it("debounces rapid duplicate notifications within the cooldown window", () => {
    expect(notificationDebouncer.shouldShow("dup_test", 2000)).toBe(true);
    // Immediate repeat of same key should be suppressed
    expect(notificationDebouncer.shouldShow("dup_test", 2000)).toBe(false);
    // Different key should still show
    expect(notificationDebouncer.shouldShow("other_key", 2000)).toBe(true);

    // After clearing, same key shows again
    notificationDebouncer.clear();
    expect(notificationDebouncer.shouldShow("dup_test", 2000)).toBe(true);
  });

  it("carries actionable farmer hints for critical errors", () => {
    const sessionHi = getLocalizedNotification("invalid_session", "hi");
    expect(sessionHi.actionHint).toBeDefined();
    expect(sessionHi.actionHint).toContain("लॉगिन");

    const dupEn = getLocalizedNotification("duplicate_images", "en");
    expect(dupEn.actionHint).toBeDefined();
    expect(dupEn.actionHint).toContain("3 distinct photos");

    const lightHi = getLocalizedNotification("unusable_lighting", "hi");
    expect(lightHi.actionHint).toBeDefined();
    expect(lightHi.actionHint).toContain("रोशनी");
  });
});
