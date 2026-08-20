import { describe, it, expect } from "vitest";
import { Prisma } from "@prisma/client";

describe("Prisma schema", () => {
  it("defines Campaign with displayConfig and no joinYears field", () => {
    const fields = Prisma.dmmf.datamodel.models.find(m => m.name === "Campaign")!.fields.map(f => f.name);
    expect(fields).toContain("displayConfig");
    expect(fields).not.toContain("joinYears");
  });

  it("defines Template with overlayConfig, not a fixed components list", () => {
    const fields = Prisma.dmmf.datamodel.models.find(m => m.name === "Template")!.fields.map(f => f.name);
    expect(fields).toContain("overlayConfig");
  });

  it("indexes Campaign on status + startDate + endDate for the active-campaign lookup", () => {
    const campaignModel = Prisma.dmmf.datamodel.models.find(m => m.name === "Campaign")!;
    const index = campaignModel.uniqueIndexes.concat(
      (campaignModel as any).indexes ?? []
    ).find((idx: any) => JSON.stringify(idx.fields) === JSON.stringify(["status", "startDate", "endDate"]));
    expect(index).toBeDefined();
  });
});
