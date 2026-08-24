import { describe, it, expect } from "vitest";
import { COMPONENT_PRESETS } from "../../src/lib/component-presets";

describe("COMPONENT_PRESETS", () => {
  it("has exactly the 4 presets from the demo, in order", () => {
    expect(COMPONENT_PRESETS.map(p => p.key)).toEqual(["joinYear", "unit", "slogan", "signature"]);
  });

  it("joinYear is a select with options from 1988 up to the current year, descending", () => {
    const joinYear = COMPONENT_PRESETS.find(p => p.key === "joinYear")!;
    expect(joinYear.type).toBe("select");
    const currentYear = new Date().getFullYear();
    expect(joinYear.options![0]).toBe(String(currentYear));
    expect(joinYear.options![joinYear.options!.length - 1]).toBe("1988");
    expect(joinYear.options!.length).toBe(currentYear - 1988 + 1);
  });

  it("unit is a select with the fixed FPT business unit list", () => {
    const unit = COMPONENT_PRESETS.find(p => p.key === "unit")!;
    expect(unit.options).toEqual(["FPT Software", "FPT Telecom", "FPT IS", "FPT Education", "FPT Retail", "Khác"]);
  });

  it("slogan and signature are free-text presets with placeholders, no options", () => {
    const slogan = COMPONENT_PRESETS.find(p => p.key === "slogan")!;
    const signature = COMPONENT_PRESETS.find(p => p.key === "signature")!;
    expect(slogan.type).toBe("text");
    expect(slogan.options).toBeUndefined();
    expect(slogan.placeholder).toBe("VD: Dream Big, Move Fast");
    expect(signature.type).toBe("text");
    expect(signature.placeholder).toBe("VD: Nguyễn Văn A");
  });
});
