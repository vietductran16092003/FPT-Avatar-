/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { GoogleAnalytics } from "../../src/components/google-analytics";

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
});

describe("GoogleAnalytics", () => {
  it("renders nothing when NEXT_PUBLIC_GA_MEASUREMENT_ID is not set", () => {
    vi.stubEnv("NEXT_PUBLIC_GA_MEASUREMENT_ID", "");
    const { container } = render(<GoogleAnalytics />);
    expect(container.innerHTML).toBe("");
  });

  it("renders the gtag scripts when a measurement ID is configured", () => {
    vi.stubEnv("NEXT_PUBLIC_GA_MEASUREMENT_ID", "G-TEST123");
    render(<GoogleAnalytics />);
    // next/script inserts script tags into the document outside the
    // component's own render tree, so assert against `document`, not the
    // render()-returned `container`.
    expect(document.querySelector('script[src*="G-TEST123"]')).toBeTruthy();
  });
});
