import { PrismaClient } from "@prisma/client";
import { readFile } from "fs/promises";
import { join } from "path";
import { getStorage } from "../src/lib/server/storage";
import type { ImageStorage } from "../src/lib/server/storage/types";

const SEED_ASSETS_DIR = join(__dirname, "seed-assets");

// The seeded Campaign/Template rows reference these frame image keys, but a
// fresh MinIO volume has no files at all — without this upload, the public
// preview and /generate compositing silently never render (they wait on the
// frame image, which just 404s forever) even though the DB looks complete.
async function uploadPlaceholderFrame(storage: ImageStorage, assetFile: string, key: string) {
  const buffer = await readFile(join(SEED_ASSETS_DIR, assetFile));
  await storage.upload(key, buffer, "image/png");
}

export async function seedDatabase(client: PrismaClient, storage: ImageStorage = getStorage()) {
  await uploadPlaceholderFrame(storage, "frame-fpt38-orange.png", "frames/fpt38-orange.png");
  await uploadPlaceholderFrame(storage, "frame-tw-blue.png", "frames/tw-blue.png");

  await client.campaign.create({
    data: {
      slug: "fpt38",
      status: "active",
      startDate: new Date("2026-08-13"),
      endDate: new Date("2026-09-13"),
      language: "vi",
      displayConfig: {
        title: "Khung Avatar Chào mừng sinh nhật FPT lần thứ 38",
        titleEn: "FPT 38th Anniversary Avatar Frame",
        description: "Tạo avatar kỷ niệm 38 năm",
        descriptionEn: "Create your avatar for FPT's 38th anniversary",
        ctaLabel: "Tạo avatar ngay",
        ctaEn: "Create avatar now",
      },
      templates: {
        create: [{
          name: "Khung cam chuẩn",
          frameImageKey: "frames/fpt38-orange.png",
          overlayConfig: {
            // Matches the transparent photo-hole in the Frame 29 artwork
            // (roughly x:22-442, y:22-398 of its 464x464 source).
            photoArea: { x: 5, y: 5, w: 90, h: 81 },
            textOverlays: [
              {
                key: "joinYear",
                label: "NĂM GIA NHẬP FPT",
                labelEn: "YEAR YOU JOINED FPT",
                type: "yearsSince",
                options: Array.from({ length: 2026 - 1988 + 1 }, (_, i) => String(1988 + i)),
                // Curves along the top-left rim of the white photo circle
                // (see Frame 29 artwork). When `curve` is set, x/y/rotation
                // are ignored for drawing (kept only as a straight-text
                // fallback); the arc params below are what position the text.
                x: 21,
                y: 19,
                fontSize: 46,
                color: "#ffffff",
                fontWeight: "bold",
                rotation: -44,
                curve: {
                  centerX: 50, // % width — center of the photo circle
                  centerY: 48, // % height
                  radius: 44,  // % width — just outside the circle's rim
                  angle: -135, // deg (0=right, -90=up) — midpoint of the text, ~10:30
                  direction: "cw",
                },
              },
            ],
          },
        }],
      },
    },
  });

  await client.campaign.create({
    data: {
      slug: "techweek-2026",
      status: "active",
      startDate: new Date("2026-08-20"),
      endDate: new Date("2026-08-28"),
      language: "vi",
      displayConfig: { title: "Ngày hội Công nghệ FPT 2026", description: "Ghép avatar cùng khung Tech Week", ctaLabel: "Tạo avatar ngay" },
      templates: {
        create: [{
          name: "Khung công nghệ xanh dương",
          frameImageKey: "frames/tw-blue.png",
          overlayConfig: {
            photoArea: { x: 16, y: 18, w: 68, h: 68 },
            textOverlays: [
              { key: "unit", label: "Đơn vị công tác", labelEn: "Business unit", type: "select", options: ["FPT Software", "FPT Telecom", "FPT IS"], x: 50, y: 88, fontSize: 20, color: "#ffffff" },
            ],
          },
        }],
      },
    },
  });
}

if (require.main === module) {
  const client = new PrismaClient();
  seedDatabase(client).finally(() => client.$disconnect());
}
