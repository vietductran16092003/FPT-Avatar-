/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { CurveTextPicker } from "../../../src/app/admin/campaigns/curve-text-picker";

afterEach(() => cleanup());

function stubRect(el: Element, width: number, height: number) {
  vi.spyOn(el, "getBoundingClientRect").mockReturnValue({
    width, height, top: 0, left: 0, right: width, bottom: height, x: 0, y: 0, toJSON: () => {},
  });
}

describe("CurveTextPicker", () => {
  it("shows a hint instead of an image when no frame image is available yet", () => {
    render(<CurveTextPicker imageUrl={null} value={{ centerX: 50, centerY: 50, radius: 20, angle: -90, direction: "cw" }} onChange={() => {}} />);
    expect(screen.getByText("Tải ảnh khung lên để đặt đường cong chữ")).toBeTruthy();
  });

  it("positions the center and anchor handles per the current value", () => {
    render(<CurveTextPicker imageUrl="http://frame.png" value={{ centerX: 50, centerY: 50, radius: 20, angle: 0, direction: "cw" }} onChange={() => {}} />);
    const center = screen.getByTestId("curve-center-handle");
    expect(center.style.left).toBe("50%");
    expect(center.style.top).toBe("50%");
    const anchor = screen.getByTestId("curve-anchor-handle");
    expect(anchor.style.left).toBe("70%"); // centerX + radius*cos(0deg) = 50+20
    expect(anchor.style.top).toBe("50%");  // centerY + radius*sin(0deg) = 50+0
  });

  it("dragging the center handle updates centerX/centerY without changing radius/angle", () => {
    const onChange = vi.fn();
    render(<CurveTextPicker imageUrl="http://frame.png" value={{ centerX: 50, centerY: 50, radius: 20, angle: 0, direction: "cw" }} onChange={onChange} />);
    const container = screen.getByTestId("curve-text-picker");
    stubRect(container, 200, 200);
    const center = screen.getByTestId("curve-center-handle");

    fireEvent.pointerDown(center, { clientX: 100, clientY: 100 });
    fireEvent.pointerMove(window, { clientX: 160, clientY: 40 });

    expect(onChange).toHaveBeenLastCalledWith({ centerX: 80, centerY: 20, radius: 20, angle: 0, direction: "cw" });
  });

  it("dragging the anchor handle recomputes radius/angle from the pointer position without changing centerX/centerY", () => {
    const onChange = vi.fn();
    render(<CurveTextPicker imageUrl="http://frame.png" value={{ centerX: 50, centerY: 50, radius: 20, angle: 0, direction: "cw" }} onChange={onChange} />);
    const container = screen.getByTestId("curve-text-picker");
    stubRect(container, 200, 200);
    const anchor = screen.getByTestId("curve-anchor-handle");

    fireEvent.pointerDown(anchor, { clientX: 140, clientY: 100 });
    fireEvent.pointerMove(window, { clientX: 150, clientY: 50 });

    const lastCall = onChange.mock.calls[onChange.mock.calls.length - 1][0];
    expect(lastCall.centerX).toBe(50);
    expect(lastCall.centerY).toBe(50);
    expect(lastCall.radius).toBeCloseTo(35.355, 2);
    expect(lastCall.angle).toBeCloseTo(-45, 2);
    expect(lastCall.direction).toBe("cw");
  });

  it("toggles direction between clockwise and counter-clockwise", () => {
    const onChange = vi.fn();
    render(<CurveTextPicker imageUrl="http://frame.png" value={{ centerX: 50, centerY: 50, radius: 20, angle: 0, direction: "cw" }} onChange={onChange} />);

    fireEvent.click(screen.getByRole("button", { name: "Thuận kim đồng hồ" }));

    expect(onChange).toHaveBeenLastCalledWith({ centerX: 50, centerY: 50, radius: 20, angle: 0, direction: "ccw" });
  });
});
