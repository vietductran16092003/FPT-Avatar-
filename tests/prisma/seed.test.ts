import { describe, it, expect, vi } from "vitest";
import { seedDatabase } from "../../prisma/seed";

function fakeStorage() {
  return {
    upload: vi.fn().mockResolvedValue(undefined),
    download: vi.fn(),
    getPublicUrl: vi.fn(),
    delete: vi.fn(),
  };
}

describe("seedDatabase", () => {
  it("creates the two demo campaigns with generic textOverlays, not fixed joinYear columns", async () => {
    const create = vi.fn().mockResolvedValue({});
    const fakeClient = { campaign: { create } } as any;

    await seedDatabase(fakeClient, fakeStorage());

    expect(create).toHaveBeenCalledTimes(2);
    const firstCallData = create.mock.calls[0][0].data;
    expect(firstCallData.slug).toBe("fpt38");
    expect(firstCallData.templates.create[0].overlayConfig.textOverlays[0].key).toBe("joinYear");
  });

  it("uploads a placeholder frame image for every frameImageKey referenced by the seeded campaigns", async () => {
    const create = vi.fn().mockResolvedValue({});
    const fakeClient = { campaign: { create } } as any;
    const storage = fakeStorage();

    await seedDatabase(fakeClient, storage);

    expect(storage.upload).toHaveBeenCalledWith("frames/fpt38-orange.png", expect.any(Buffer), "image/png");
    expect(storage.upload).toHaveBeenCalledWith("frames/tw-blue.png", expect.any(Buffer), "image/png");
  });
});
