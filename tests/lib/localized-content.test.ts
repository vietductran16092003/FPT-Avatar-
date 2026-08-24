import { describe, it, expect } from "vitest";
import { pickLocalized } from "../../src/lib/localized-content";

describe("pickLocalized", () => {
  it("returns the VI value when lang is vi", () => {
    expect(pickLocalized({ title: "Tiêu đề", titleEn: "Title" }, "title", "vi")).toBe("Tiêu đề");
  });

  it("returns the EN value when lang is en and it is present", () => {
    expect(pickLocalized({ title: "Tiêu đề", titleEn: "Title" }, "title", "en")).toBe("Title");
  });

  it("falls back to the VI value when lang is en but the EN field is empty", () => {
    expect(pickLocalized({ title: "Tiêu đề", titleEn: "" }, "title", "en")).toBe("Tiêu đề");
  });

  it("maps the ctaLabel field to the ctaEn key, not ctaLabelEn", () => {
    expect(pickLocalized({ ctaLabel: "Tạo ngay", ctaEn: "Create now" }, "ctaLabel", "en")).toBe("Create now");
  });

  it("returns an empty string when displayConfig is null or undefined", () => {
    expect(pickLocalized(null, "title", "vi")).toBe("");
    expect(pickLocalized(undefined, "description", "en")).toBe("");
  });
});
