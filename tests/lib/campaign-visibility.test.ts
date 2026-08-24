import { describe, it, expect } from "vitest";
import { isCampaignPubliclyVisible } from "../../src/lib/campaign-visibility";

const now = new Date("2026-08-22T00:00:00.000Z");

describe("isCampaignPubliclyVisible", () => {
  it("returns true for an active campaign within its date range", () => {
    const campaign = { status: "active", startDate: new Date("2026-08-01"), endDate: new Date("2026-09-01") };
    expect(isCampaignPubliclyVisible(campaign, now)).toBe(true);
  });

  it("returns false for a draft campaign within its date range", () => {
    const campaign = { status: "draft", startDate: new Date("2026-08-01"), endDate: new Date("2026-09-01") };
    expect(isCampaignPubliclyVisible(campaign, now)).toBe(false);
  });

  it("returns false for an active campaign before its startDate", () => {
    const campaign = { status: "active", startDate: new Date("2026-09-01"), endDate: new Date("2026-10-01") };
    expect(isCampaignPubliclyVisible(campaign, now)).toBe(false);
  });

  it("returns false for an active campaign after its endDate", () => {
    const campaign = { status: "active", startDate: new Date("2026-01-01"), endDate: new Date("2026-08-01") };
    expect(isCampaignPubliclyVisible(campaign, now)).toBe(false);
  });
});
