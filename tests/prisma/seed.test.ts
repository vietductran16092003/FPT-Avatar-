import { describe, it, expect, vi } from "vitest";
import { seedDatabase } from "../../prisma/seed";

describe("seedDatabase", () => {
  it("creates the two demo campaigns with generic textOverlays, not fixed joinYear columns", async () => {
    const create = vi.fn().mockResolvedValue({});
    const fakeClient = { campaign: { create } } as any;

    await seedDatabase(fakeClient);

    expect(create).toHaveBeenCalledTimes(2);
    const firstCallData = create.mock.calls[0][0].data;
    expect(firstCallData.slug).toBe("fpt38");
    expect(firstCallData.templates.create[0].overlayConfig.textOverlays[0].key).toBe("joinYear");
  });
});
