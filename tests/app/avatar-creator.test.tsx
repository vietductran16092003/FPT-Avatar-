/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PublicLangProvider } from "../../src/lib/public-i18n";
import { AvatarCreator, type Template } from "../../src/app/(public)/c/[slug]/avatar-creator";

afterEach(() => {
  cleanup();
});

const templates: Template[] = [
  {
    id: "t1",
    name: "Khung cam",
    frameImageUrl: "http://storage/frames/orange.png",
    overlayConfig: {
      photoArea: { x: 10, y: 10, w: 60, h: 60 },
      textOverlays: [
        { key: "slogan", label: "Câu châm ngôn", labelEn: "Slogan", type: "text", placeholder: "VD: Dream Big", x: 50, y: 90, fontSize: 20, color: "#fff" },
        { key: "unit", label: "Đơn vị", labelEn: "Unit", type: "select", options: ["FPT Software", "FPT Telecom"], x: 50, y: 70, fontSize: 20, color: "#fff" },
      ],
    },
  },
];

function renderCreator(tpls: Template[] = templates) {
  return render(
    <PublicLangProvider>
      <AvatarCreator slug="fpt38" templates={tpls} />
    </PublicLangProvider>,
  );
}

// The download action is rendered twice — once in the desktop preview panel,
// once in the mobile sticky bottom bar — both wired to the same handler and
// disabled state. jsdom renders both regardless of the Tailwind `hidden`
// class (no real CSS layout), so tests target the first (desktop) instance.
function getDownloadButton() {
  return screen.getAllByRole("button", { name: "TẢI ẢNH" })[0];
}
async function findDownloadButton() {
  return (await screen.findAllByRole("button", { name: "TẢI ẢNH" }))[0];
}

describe("AvatarCreator", () => {
  it("shows the frame name and step labels", () => {
    renderCreator();
    expect(screen.getByText("Khung cam")).toBeTruthy();
    expect(screen.getByText("1. Tải ảnh của bạn")).toBeTruthy();
    expect(screen.getByText("2. Chọn khung")).toBeTruthy();
    expect(screen.getByText("3. Điền thông tin")).toBeTruthy();
  });

  it("renders a text input for a text overlay and a select for a select overlay, using the template's first frame by default", () => {
    renderCreator();
    expect(screen.getByLabelText("Câu châm ngôn")).toBeTruthy();
    const unitSelect = screen.getByLabelText("Đơn vị") as HTMLSelectElement;
    expect(Array.from(unitSelect.options).map(o => o.value).filter(Boolean)).toEqual(["FPT Software", "FPT Telecom"]);
  });

  it("disables the download button until a photo is uploaded and all overlay fields are filled", async () => {
    renderCreator();
    const downloadBtn = getDownloadButton();
    expect(downloadBtn).toBeDisabled();

    const file = new File(["photo-bytes"], "me.jpg", { type: "image/jpeg" });
    await userEvent.upload(screen.getByLabelText("1. Tải ảnh của bạn"), file);
    expect(downloadBtn).toBeDisabled(); // overlay fields still empty

    await userEvent.type(screen.getByLabelText("Câu châm ngôn"), "Dream Big");
    await userEvent.selectOptions(screen.getByLabelText("Đơn vị"), "FPT Software");

    await waitFor(() => expect(downloadBtn).not.toBeDisabled());
  });

  it("accepts a photo dropped onto the upload dropzone", async () => {
    renderCreator();
    const file = new File(["photo-bytes"], "me.jpg", { type: "image/jpeg" });

    fireEvent.drop(screen.getByTestId("photo-dropzone"), { dataTransfer: { files: [file] } });

    await waitFor(() => expect(screen.getByText("Đổi ảnh khác")).toBeTruthy());
  });

  it("rejects a dropped photo over 10MB with a visible warning and does not stage it", async () => {
    renderCreator();
    const oversized = new File([new Uint8Array(10 * 1024 * 1024 + 1)], "big.jpg", { type: "image/jpeg" });

    fireEvent.drop(screen.getByTestId("photo-dropzone"), { dataTransfer: { files: [oversized] } });

    await waitFor(() => expect(screen.getByRole("alert").textContent).toMatch(/10MB/));
    expect(getDownloadButton()).toBeDisabled();
  });

  it("rejects a photo over 10MB with a visible warning and does not stage it", async () => {
    renderCreator();
    const oversized = new File([new Uint8Array(10 * 1024 * 1024 + 1)], "big.jpg", { type: "image/jpeg" });
    await userEvent.upload(screen.getByLabelText("1. Tải ảnh của bạn"), oversized);

    expect(screen.getByRole("alert").textContent).toMatch(/10MB/);
    expect(getDownloadButton()).toBeDisabled();
  });

  it("switches the selected frame and resets its overlay field values when a second template is chosen", async () => {
    const second: Template = {
      id: "t2",
      name: "Khung xanh",
      frameImageUrl: "http://storage/frames/blue.png",
      overlayConfig: { photoArea: { x: 5, y: 5, w: 70, h: 70 }, textOverlays: [{ key: "name", label: "Tên", labelEn: "Name", type: "text", x: 50, y: 80, fontSize: 18, color: "#fff" }] },
    };
    renderCreator([...templates, second]);

    await userEvent.click(screen.getByText("Khung xanh"));

    expect(screen.getByLabelText("Tên")).toBeTruthy();
    expect(screen.queryByLabelText("Câu châm ngôn")).toBeNull();
  });

  it("POSTs FormData to /generate and auto-downloads the result when the download button is clicked", async () => {
    const resultBlob = new Blob(["png-bytes"], { type: "image/png" });
    global.fetch = vi.fn((url: string) => {
      if (url === "/api/campaigns/fpt38/generate") {
        return Promise.resolve({ ok: true, json: async () => ({ resultUrl: "http://storage/results/t1-123.png" }) });
      }
      if (url === "http://storage/results/t1-123.png") {
        return Promise.resolve({ ok: true, blob: async () => resultBlob });
      }
      return Promise.resolve({ ok: true, json: async () => ({}) });
    }) as unknown as typeof fetch;

    const createObjectURLSpy = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:fake-url");
    const revokeObjectURLSpy = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

    renderCreator();
    const file = new File(["photo-bytes"], "me.jpg", { type: "image/jpeg" });
    await userEvent.upload(screen.getByLabelText("1. Tải ảnh của bạn"), file);
    await userEvent.type(screen.getByLabelText("Câu châm ngôn"), "Dream Big");
    await userEvent.selectOptions(screen.getByLabelText("Đơn vị"), "FPT Software");

    const downloadBtn = await findDownloadButton();
    await waitFor(() => expect(downloadBtn).not.toBeDisabled());
    await userEvent.click(downloadBtn);

    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith("/api/campaigns/fpt38/generate", expect.objectContaining({ method: "POST" })));
    const generateCall = (global.fetch as any).mock.calls.find((c: any[]) => c[0] === "/api/campaigns/fpt38/generate");
    const sentForm = generateCall[1].body as FormData;
    expect(sentForm.get("templateId")).toBe("t1");
    expect(sentForm.get("photo")).toBe(file);
    expect(JSON.parse(sentForm.get("overlayValues") as string)).toEqual({ slogan: "Dream Big", unit: "FPT Software" });

    await waitFor(() => expect(clickSpy).toHaveBeenCalled());
    expect(createObjectURLSpy).toHaveBeenCalledWith(resultBlob);
    expect(revokeObjectURLSpy).toHaveBeenCalledWith("blob:fake-url");
  });

  it("shows the server's error message and does not crash when /generate fails", async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, json: async () => ({ error: "Template not found" }) });

    renderCreator();
    const file = new File(["photo-bytes"], "me.jpg", { type: "image/jpeg" });
    await userEvent.upload(screen.getByLabelText("1. Tải ảnh của bạn"), file);
    await userEvent.type(screen.getByLabelText("Câu châm ngôn"), "Dream Big");
    await userEvent.selectOptions(screen.getByLabelText("Đơn vị"), "FPT Software");

    const downloadBtn = await findDownloadButton();
    await waitFor(() => expect(downloadBtn).not.toBeDisabled());
    await userEvent.click(downloadBtn);

    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("Template not found"));
  });

  it("shows a translated session-expired message instead of the raw API error when /generate returns 401", async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 401, json: async () => ({ error: "Unauthorized" }) });

    renderCreator();
    const file = new File(["photo-bytes"], "me.jpg", { type: "image/jpeg" });
    await userEvent.upload(screen.getByLabelText("1. Tải ảnh của bạn"), file);
    await userEvent.type(screen.getByLabelText("Câu châm ngôn"), "Dream Big");
    await userEvent.selectOptions(screen.getByLabelText("Đơn vị"), "FPT Software");

    const downloadBtn = await findDownloadButton();
    await waitFor(() => expect(downloadBtn).not.toBeDisabled());
    await userEvent.click(downloadBtn);

    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("Phiên đăng nhập đã hết hạn"));
    expect(screen.getByRole("alert").textContent).not.toContain("Unauthorized");
  });

  it("does not show share buttons before a successful download", () => {
    renderCreator();
    expect(screen.queryByText("Chia sẻ lên")).toBeNull();
  });

  it("uses navigator.share when available, as a single share action", async () => {
    const shareSpy = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "share", { value: shareSpy, configurable: true });

    global.fetch = vi.fn((url: string) => {
      if (url === "/api/campaigns/fpt38/generate") {
        return Promise.resolve({ ok: true, json: async () => ({ resultUrl: "http://storage/results/t1-123.png" }) });
      }
      return Promise.resolve({ ok: true, blob: async () => new Blob(["x"], { type: "image/png" }) });
    }) as unknown as typeof fetch;
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:fake-url");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

    renderCreator();
    await userEvent.upload(screen.getByLabelText("1. Tải ảnh của bạn"), new File(["x"], "me.jpg", { type: "image/jpeg" }));
    await userEvent.type(screen.getByLabelText("Câu châm ngôn"), "Dream Big");
    await userEvent.selectOptions(screen.getByLabelText("Đơn vị"), "FPT Software");
    const downloadBtn = await findDownloadButton();
    await waitFor(() => expect(downloadBtn).not.toBeDisabled());
    await userEvent.click(downloadBtn);

    const shareBtn = await screen.findByRole("button", { name: "Chia sẻ lên" });
    await userEvent.click(shareBtn);
    expect(shareSpy).toHaveBeenCalledWith(expect.objectContaining({ url: "http://storage/results/t1-123.png" }));

    // @ts-expect-error - cleanup the test-only property
    delete navigator.share;
  });

  it("falls back to platform share links when navigator.share is unavailable", async () => {
    // @ts-expect-error - ensure it's absent for this test
    delete navigator.share;

    global.fetch = vi.fn((url: string) => {
      if (url === "/api/campaigns/fpt38/generate") {
        return Promise.resolve({ ok: true, json: async () => ({ resultUrl: "http://storage/results/t1-123.png" }) });
      }
      return Promise.resolve({ ok: true, blob: async () => new Blob(["x"], { type: "image/png" }) });
    }) as unknown as typeof fetch;
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:fake-url");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

    renderCreator();
    await userEvent.upload(screen.getByLabelText("1. Tải ảnh của bạn"), new File(["x"], "me.jpg", { type: "image/jpeg" }));
    await userEvent.type(screen.getByLabelText("Câu châm ngôn"), "Dream Big");
    await userEvent.selectOptions(screen.getByLabelText("Đơn vị"), "FPT Software");
    const downloadBtn = await findDownloadButton();
    await waitFor(() => expect(downloadBtn).not.toBeDisabled());
    await userEvent.click(downloadBtn);

    const fbLink = await screen.findByRole("link", { name: "Facebook" });
    expect(fbLink.getAttribute("href")).toContain("facebook.com/sharer");
    expect(fbLink.getAttribute("target")).toBe("_blank");
  });
});
