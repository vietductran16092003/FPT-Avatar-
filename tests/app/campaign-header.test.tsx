/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CampaignHeader } from "../../src/app/(public)/c/[slug]/campaign-header";
import { PublicLangProvider } from "../../src/lib/public-i18n";

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  cleanup();
});

function renderHeader() {
  return render(
    <PublicLangProvider>
      <CampaignHeader />
    </PublicLangProvider>,
  );
}

describe("CampaignHeader", () => {
  it("renders the FPT logo and the 38th-anniversary badge", () => {
    renderHeader();
    expect(screen.getByAltText("FPT")).toBeTruthy();
    expect(screen.getByAltText("38 năm FPT")).toBeTruthy();
  });

  it("shows the current language on the toggle button, defaulting to Vietnamese", () => {
    renderHeader();
    expect(screen.getByRole("button", { name: /Tiếng Việt/ })).toBeTruthy();
  });

  it("opens a dropdown with both languages and switches to English on selection", async () => {
    renderHeader();

    await userEvent.click(screen.getByRole("button", { name: /Tiếng Việt/ }));
    const options = screen.getAllByRole("option");
    expect(options.map(o => o.textContent)).toEqual(["Tiếng Việt", "English"]);

    await userEvent.click(screen.getByRole("option", { name: "English" }));

    expect(screen.getByRole("button", { name: /English/ })).toBeTruthy();
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("persists the selected language across a re-render (localStorage)", async () => {
    renderHeader();
    await userEvent.click(screen.getByRole("button", { name: /Tiếng Việt/ }));
    await userEvent.click(screen.getByRole("option", { name: "English" }));

    cleanup();
    renderHeader();

    expect(screen.getByRole("button", { name: /English/ })).toBeTruthy();
  });
});
