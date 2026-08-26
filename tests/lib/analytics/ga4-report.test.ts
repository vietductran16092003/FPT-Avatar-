/**
 * @vitest-environment node
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const runReportMock = vi.fn();
vi.mock("@google-analytics/data", () => ({
  // Must be a real function (not an arrow) — the code under test calls
  // `new BetaAnalyticsDataClient()`, and arrow functions can't be constructors.
  BetaAnalyticsDataClient: vi.fn().mockImplementation(function () {
    return { runReport: (...args: unknown[]) => runReportMock(...args) };
  }),
}));

import { fetchDownloadsByField } from "../../../src/lib/server/analytics/ga4-report";

const ORIGINAL_ENV = process.env.GA4_PROPERTY_ID;

beforeEach(() => {
  runReportMock.mockReset();
});

afterEach(() => {
  process.env.GA4_PROPERTY_ID = ORIGINAL_ENV;
});

describe("fetchDownloadsByField", () => {
  it("returns null without calling the API when GA4_PROPERTY_ID is not set", async () => {
    delete process.env.GA4_PROPERTY_ID;

    const result = await fetchDownloadsByField("unit");

    expect(result).toBeNull();
    expect(runReportMock).not.toHaveBeenCalled();
  });

  it("maps GA4 report rows into {name, value} pairs, scoped to the avatar_download event", async () => {
    process.env.GA4_PROPERTY_ID = "123456";
    runReportMock.mockResolvedValue([
      {
        rows: [
          { dimensionValues: [{ value: "FPT Software" }], metricValues: [{ value: "420" }] },
          { dimensionValues: [{ value: "FPT Telecom" }], metricValues: [{ value: "310" }] },
        ],
      },
    ]);

    const result = await fetchDownloadsByField("unit");

    expect(result).toEqual([
      { name: "FPT Software", value: 420 },
      { name: "FPT Telecom", value: 310 },
    ]);
    expect(runReportMock).toHaveBeenCalledWith(
      expect.objectContaining({
        property: "properties/123456",
        dimensions: [{ name: "customEvent:unit" }],
        dimensionFilter: { filter: { fieldName: "eventName", stringFilter: { value: "avatar_download" } } },
      }),
    );
  });

  it("filters out GA4's '(not set)' placeholder rows", async () => {
    process.env.GA4_PROPERTY_ID = "123456";
    runReportMock.mockResolvedValue([
      { rows: [{ dimensionValues: [{ value: "(not set)" }], metricValues: [{ value: "5" }] }] },
    ]);

    expect(await fetchDownloadsByField("unit")).toEqual([]);
  });

  it("returns null (does not throw) when the GA4 API call fails", async () => {
    process.env.GA4_PROPERTY_ID = "123456";
    runReportMock.mockRejectedValue(new Error("custom dimension not found"));

    await expect(fetchDownloadsByField("unit")).resolves.toBeNull();
  });
});
