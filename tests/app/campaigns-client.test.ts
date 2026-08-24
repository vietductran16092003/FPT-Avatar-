import { describe, it, expect, vi, afterEach } from "vitest";
import { fetchActiveCampaigns } from "../../src/app/campaigns-client";

afterEach(() => vi.restoreAllMocks());

describe("fetchActiveCampaigns", () => {
  it("fetches from an absolute /api/campaigns URL (safe to call from a Server Component)", async () => {
    global.fetch = vi.fn().mockResolvedValue({ json: async () => [{ slug: "fpt38" }] });

    const campaigns = await fetchActiveCampaigns();

    expect(campaigns).toEqual([{ slug: "fpt38" }]);
    expect(global.fetch).toHaveBeenCalledWith("http://localhost:3000/api/campaigns", expect.any(Object));
  });

  it("returns an empty array (not an error) when the API returns none", async () => {
    global.fetch = vi.fn().mockResolvedValue({ json: async () => [] });

    const campaigns = await fetchActiveCampaigns();

    expect(campaigns).toEqual([]);
  });
});
