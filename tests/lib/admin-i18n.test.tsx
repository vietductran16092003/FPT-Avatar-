/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AdminLangProvider, useAdminLang, ADMIN_LANG_STORAGE_KEY } from "../../src/lib/admin-i18n";

function Probe() {
  const { lang, setLang, t } = useAdminLang();
  return (
    <div>
      <span data-testid="lang">{lang}</span>
      <span data-testid="label">{t("adminCampaigns")}</span>
      <button onClick={() => setLang(lang === "vi" ? "en" : "vi")}>toggle</button>
    </div>
  );
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  cleanup();
});

describe("AdminLangProvider / useAdminLang", () => {
  it("defaults to vi and renders the vi label", () => {
    render(<AdminLangProvider><Probe /></AdminLangProvider>);
    expect(screen.getByTestId("lang").textContent).toBe("vi");
    expect(screen.getByTestId("label").textContent).toBe("Campaigns");
  });

  it("switches language, updates the translated label, and persists to localStorage", async () => {
    render(<AdminLangProvider><Probe /></AdminLangProvider>);
    await userEvent.click(screen.getByText("toggle"));
    expect(screen.getByTestId("lang").textContent).toBe("en");
    expect(screen.getByTestId("label").textContent).toBe("Campaigns");
    expect(localStorage.getItem(ADMIN_LANG_STORAGE_KEY)).toBe("en");
  });

  it("restores a previously saved language on mount", () => {
    localStorage.setItem(ADMIN_LANG_STORAGE_KEY, "en");
    render(<AdminLangProvider><Probe /></AdminLangProvider>);
    expect(screen.getByTestId("lang").textContent).toBe("en");
  });

  it("falls back to the key itself when a translation is missing", () => {
    function MissingKeyProbe() {
      const { t } = useAdminLang();
      // @ts-expect-error - deliberately testing an unknown key at runtime
      return <span data-testid="missing">{t("thisKeyDoesNotExist")}</span>;
    }
    render(<AdminLangProvider><MissingKeyProbe /></AdminLangProvider>);
    expect(screen.getByTestId("missing").textContent).toBe("thisKeyDoesNotExist");
  });
});
