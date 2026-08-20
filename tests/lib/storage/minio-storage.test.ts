import { describe, it, expect, vi } from "vitest";
import { MinioStorage } from "../../../src/lib/storage/minio-storage";

describe("MinioStorage", () => {
  it("uploads via the injected S3 client and builds a public URL from the bucket", async () => {
    const send = vi.fn().mockResolvedValue({});
    const fakeClient = { send };
    const storage = new MinioStorage(fakeClient as any, "avatars", "http://localhost:9000");

    await storage.upload("templates/frame.png", Buffer.from("x"), "image/png");

    expect(send).toHaveBeenCalledTimes(1);
    expect(storage.getPublicUrl("templates/frame.png")).toBe("http://localhost:9000/avatars/templates/frame.png");
  });

  it("downloads an object's bytes via the injected S3 client", async () => {
    const fakeBody = {
      transformToByteArray: vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3])),
    };
    const send = vi.fn().mockResolvedValue({ Body: fakeBody });
    const storage = new MinioStorage({ send } as any, "avatars", "http://localhost:9000");

    const result = await storage.download("templates/frame.png");

    expect(send).toHaveBeenCalledTimes(1);
    expect(Buffer.isBuffer(result)).toBe(true);
    expect(Array.from(result)).toEqual([1, 2, 3]);
  });

  it("deletes via the injected S3 client", async () => {
    const send = vi.fn().mockResolvedValue({});
    const storage = new MinioStorage({ send } as any, "avatars", "http://localhost:9000");

    await storage.delete("templates/frame.png");

    expect(send).toHaveBeenCalledTimes(1);
  });
});
