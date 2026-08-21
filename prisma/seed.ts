import { PrismaClient } from "@prisma/client";

export async function seedDatabase(client: PrismaClient) {
  await client.campaign.create({
    data: {
      slug: "fpt38",
      status: "active",
      startDate: new Date("2026-08-13"),
      endDate: new Date("2026-09-13"),
      language: "vi",
      displayConfig: { title: "FPT tròn 38 tuổi", description: "Tạo avatar kỷ niệm 38 năm", ctaLabel: "Tạo avatar ngay" },
      templates: {
        create: [{
          name: "Khung cam chuẩn",
          frameImageKey: "frames/fpt38-orange.png",
          overlayConfig: {
            photoArea: { x: 18, y: 14, w: 64, h: 64 },
            textOverlays: [
              { key: "joinYear", label: "Năm gia nhập FPT", labelEn: "Year joined FPT", type: "select", options: ["2020", "2021", "2022"], x: 50, y: 85, fontSize: 24, color: "#ffffff" },
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
