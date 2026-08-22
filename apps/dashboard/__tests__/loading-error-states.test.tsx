import { describe, expect, it } from "vitest";
import React from "react";
import { renderToString } from "react-dom/server";
import {
  LoadingSpinner,
  TableSkeleton,
  CardSkeleton,
  DetailSkeleton,
} from "../src/components/LoadingAnimation";
import ErrorMessage, { InlineError } from "../src/components/ErrorMessage";
import { getLandingT } from "../src/lib/landing-locales";
import { GEMINI_LIVE_INDIAN_LANGUAGE_CODES } from "../src/lib/live-indian-languages";

describe("LoadingAnimation components", () => {
  it("renders LoadingSpinner with accessibility attributes", () => {
    const html = renderToString(<LoadingSpinner size="md" label="Analyzing evidence…" />);
    expect(html).toContain('role="status"');
    expect(html).toContain("Analyzing evidence…");
    expect(html).toContain("animate-spin");
  });

  it("renders TableSkeleton with specified rows and columns", () => {
    const html = renderToString(<TableSkeleton rows={5} cols={4} />);
    expect(html).toContain('role="status"');
    expect(html).toContain("Fetching…");
    expect(html).toContain("<table");
  });

  it("renders CardSkeleton with grid layout", () => {
    const html = renderToString(<CardSkeleton count={4} />);
    expect(html).toContain('role="status"');
    expect(html).toContain("grid");
  });

  it("renders DetailSkeleton with layout placeholders", () => {
    const html = renderToString(<DetailSkeleton />);
    expect(html).toContain('role="status"');
    expect(html).toContain("animate-pulse");
  });
});

describe("ErrorMessage components", () => {
  it("renders ErrorMessage with title, description and retry label", () => {
    const html = renderToString(
      <ErrorMessage
        title="Something went wrong"
        message="Unable to connect to service"
        onRetry={() => {}}
        retryLabel="Retry Now"
        actionHref="/overview"
        actionLabel="Go back"
      />
    );
    expect(html).toContain('role="alert"');
    expect(html).toContain("Something went wrong");
    expect(html).toContain("Unable to connect to service");
    expect(html).toContain("Retry Now");
    expect(html).toContain('href="/overview"');
  });

  it("renders compact ErrorMessage for banners", () => {
    const html = renderToString(
      <ErrorMessage compact message="Failed to load notifications" />
    );
    expect(html).toContain('role="alert"');
    expect(html).toContain("Failed to load notifications");
  });

  it("renders InlineError component", () => {
    const html = renderToString(
      <InlineError message="Storage quota exceeded" />
    );
    expect(html).toContain('role="alert"');
    expect(html).toContain("Storage quota exceeded");
  });
});

describe("All 15 Indian language landing locales", () => {
  it("provides valid dictionaries with hero and perils for every language code", () => {
    for (const code of GEMINI_LIVE_INDIAN_LANGUAGE_CODES) {
      const dict = getLandingT(code);
      expect(dict).toBeDefined();
      expect(dict.kicker).toBeTruthy();
      expect(dict.brandSub).toBeTruthy();
      expect(dict.heroTitle).toBeTruthy();
      expect(dict.heroSub).toBeTruthy();
      expect(dict.startSaathi).toBeTruthy();
      expect(dict.reviewerCentre).toBeTruthy();
      expect(dict.farmerPortal).toBeTruthy();
      expect(dict.perilsTitle).toBeTruthy();
      expect(dict.pipelineTitle).toBeTruthy();
      expect(dict.stackTitle).toBeTruthy();
      expect(dict.recentClaimsTitle).toBeTruthy();
    }
  });
});
