import { describe, it, expect } from "vitest";
import { Prisma } from "@prisma/client";
import { readFileSync } from "fs";
import { join } from "path";

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
    const schema = readFileSync(join(process.cwd(), "prisma/schema.prisma"), "utf-8");
    const campaignBlock = schema.slice(schema.indexOf("model Campaign"), schema.indexOf("model Template"));
    expect(campaignBlock).toContain("@@index([status, startDate, endDate])");
  });
});
