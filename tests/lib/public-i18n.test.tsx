/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PublicLangProvider, usePublicLang, PUBLIC_LANG_STORAGE_KEY } from "../../src/lib/public-i18n";
import { ADMIN_LANG_STORAGE_KEY } from "../../src/lib/admin-i18n";

function Probe() {
  const { lang, setLang, t } = usePublicLang();
  return (
    <div>
      <span data-testid="lang">{lang}</span>
      <span data-testid="label">{t("downloadButton")}</span>
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

describe("PublicLangProvider / usePublicLang", () => {
  it("defaults to vi and renders the vi label", () => {
    render(<PublicLangProvider><Probe /></PublicLangProvider>);
    expect(screen.getByTestId("lang").textContent).toBe("vi");
    expect(screen.getByTestId("label").textContent).toBe("Tải ảnh về máy");
  });

  it("switches language, updates the translated label, and persists to its own localStorage key", async () => {
    render(<PublicLangProvider><Probe /></PublicLangProvider>);
    await userEvent.click(screen.getByText("toggle"));
    expect(screen.getByTestId("lang").textContent).toBe("en");
    expect(screen.getByTestId("label").textContent).toBe("Download image");
    expect(localStorage.getItem(PUBLIC_LANG_STORAGE_KEY)).toBe("en");
  });

  it("uses a storage key distinct from the admin lang key", () => {
    expect(PUBLIC_LANG_STORAGE_KEY).not.toBe(ADMIN_LANG_STORAGE_KEY);
  });

  it("restores a previously saved language on mount", () => {
    localStorage.setItem(PUBLIC_LANG_STORAGE_KEY, "en");
    render(<PublicLangProvider><Probe /></PublicLangProvider>);
    expect(screen.getByTestId("lang").textContent).toBe("en");
  });

  it("falls back to the key itself when a translation is missing", () => {
    function MissingKeyProbe() {
      const { t } = usePublicLang();
      // @ts-expect-error - deliberately testing an unknown key at runtime
      return <span data-testid="missing">{t("thisKeyDoesNotExist")}</span>;
    }
    render(<PublicLangProvider><MissingKeyProbe /></PublicLangProvider>);
    expect(screen.getByTestId("missing").textContent).toBe("thisKeyDoesNotExist");
  });
});
