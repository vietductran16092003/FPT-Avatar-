/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { PhotoAreaPicker } from "../../../src/app/admin/campaigns/photo-area-picker";

afterEach(() => cleanup());

function stubRect(el: Element, width: number, height: number) {
  vi.spyOn(el, "getBoundingClientRect").mockReturnValue({
    width,
    height,
    top: 0,
    left: 0,
    right: width,
    bottom: height,
    x: 0,
    y: 0,
    toJSON: () => {},
  });
}

describe("PhotoAreaPicker", () => {
  it("shows a hint instead of an image when no frame image is available yet", () => {
    render(<PhotoAreaPicker imageUrl={null} value={{ x: 20, y: 20, w: 60, h: 60 }} onChange={() => {}} />);
    expect(screen.getByText("Tải ảnh khung lên để chọn vùng ảnh cá nhân")).toBeTruthy();
  });

  it("renders the frame image and positions the box per the current value", () => {
    render(<PhotoAreaPicker imageUrl="http://frame.png" value={{ x: 10, y: 15, w: 50, h: 55 }} onChange={() => {}} />);
    const box = screen.getByTestId("photo-area-box");
    expect(box.style.left).toBe("10%");
    expect(box.style.top).toBe("15%");
    expect(box.style.width).toBe("50%");
    expect(box.style.height).toBe("55%");
  });

  it("dragging the box moves x/y without changing w/h", () => {
    const onChange = vi.fn();
    render(<PhotoAreaPicker imageUrl="http://frame.png" value={{ x: 20, y: 20, w: 40, h: 40 }} onChange={onChange} />);
    const container = screen.getByTestId("photo-area-picker");
    stubRect(container, 200, 200);
    const box = screen.getByTestId("photo-area-box");

    fireEvent.pointerDown(box, { clientX: 100, clientY: 100 });
    fireEvent.pointerMove(window, { clientX: 120, clientY: 110 });

    expect(onChange).toHaveBeenLastCalledWith({ x: 30, y: 25, w: 40, h: 40 });
  });

  it("dragging the resize handle changes w/h without changing x/y", () => {
    const onChange = vi.fn();
    render(<PhotoAreaPicker imageUrl="http://frame.png" value={{ x: 20, y: 20, w: 40, h: 40 }} onChange={onChange} />);
    const container = screen.getByTestId("photo-area-picker");
    stubRect(container, 200, 200);
    const handle = screen.getByTestId("photo-area-resize-handle");

    fireEvent.pointerDown(handle, { clientX: 100, clientY: 100 });
    fireEvent.pointerMove(window, { clientX: 130, clientY: 100 });

    expect(onChange).toHaveBeenLastCalledWith({ x: 20, y: 20, w: 55, h: 40 });
  });

  it("clamps the box so it cannot be dragged past the picker's edges", () => {
    const onChange = vi.fn();
    render(<PhotoAreaPicker imageUrl="http://frame.png" value={{ x: 80, y: 80, w: 40, h: 40 }} onChange={onChange} />);
    const container = screen.getByTestId("photo-area-picker");
    stubRect(container, 200, 200);
    const box = screen.getByTestId("photo-area-box");

    fireEvent.pointerDown(box, { clientX: 100, clientY: 100 });
    fireEvent.pointerMove(window, { clientX: 300, clientY: 300 });

    expect(onChange).toHaveBeenLastCalledWith({ x: 60, y: 60, w: 40, h: 40 });
  });
});
