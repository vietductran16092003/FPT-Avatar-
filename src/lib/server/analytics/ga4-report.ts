import { BetaAnalyticsDataClient } from "@google-analytics/data";

export interface DimensionRow {
  name: string;
  value: number;
}

// Returns null (never throws) when GA4 isn't configured yet — the caller
// falls back to the existing placeholder rather than breaking the whole
// analytics endpoint over a credential that isn't provisioned yet.
export async function fetchDownloadsByField(fieldKey: string): Promise<DimensionRow[] | null> {
  const propertyId = process.env.GA4_PROPERTY_ID;
  if (!propertyId) return null;

  try {
    const client = new BetaAnalyticsDataClient();
    const [response] = await client.runReport({
      property: `properties/${propertyId}`,
      dateRanges: [{ startDate: "30daysAgo", endDate: "today" }],
      dimensions: [{ name: `customEvent:${fieldKey}` }],
      metrics: [{ name: "eventCount" }],
      dimensionFilter: {
        filter: { fieldName: "eventName", stringFilter: { value: "avatar_download" } },
      },
    });

    return (response.rows ?? [])
      .map(row => ({
        name: row.dimensionValues?.[0]?.value ?? "",
        value: Number(row.metricValues?.[0]?.value ?? 0),
      }))
      .filter(row => row.name !== "(not set)");
  } catch {
    // A misconfigured property/credential or a custom dimension that
    // hasn't been created in the GA4 UI yet (see docs/... setup note)
    // should degrade to the placeholder, not 500 the whole dashboard.
    return null;
  }
}
