/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { trackEvent } from "../../../src/lib/analytics/ga4-client";

afterEach(() => {
  delete (window as any).gtag;
});

describe("trackEvent", () => {
  it("calls window.gtag with the event name and params when gtag is present", () => {
    const gtag = vi.fn();
    (window as any).gtag = gtag;

    trackEvent("avatar_download", { campaign_slug: "fpt38", joinYear: "2000" });

    expect(gtag).toHaveBeenCalledWith("event", "avatar_download", { campaign_slug: "fpt38", joinYear: "2000" });
  });

  it("does nothing when window.gtag is not defined (script not loaded / blocked)", () => {
    expect(() => trackEvent("campaign_view", { campaign_slug: "fpt38" })).not.toThrow();
  });

  it("does nothing when no params are given", () => {
    const gtag = vi.fn();
    (window as any).gtag = gtag;

    trackEvent("template_select");

    expect(gtag).toHaveBeenCalledWith("event", "template_select", undefined);
  });
});
