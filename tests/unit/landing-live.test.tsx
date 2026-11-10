import { fireEvent, render, screen } from "@testing-library/react";
import { LiveArtifactDemo, wrapArtifact } from "../../src/landing/LiveArtifactDemo";
import { isNativeShell } from "../../src/platform/shell";

describe("landing: paste → run demo", () => {
  it("runs the pasted HTML in a sandbox with scripts only (no same-origin, no network)", async () => {
    render(<LiveArtifactDemo />);
    const code = screen.getByLabelText(/artifact code/i) as HTMLTextAreaElement;
    expect(code.value).toMatch(/<button/);
    fireEvent.change(code, { target: { value: "<p id=x>hello live</p>" } });
    fireEvent.click(screen.getByRole("button", { name: /save & run/i }));
    const frame = (await screen.findByTitle(/live artifact preview/i)) as HTMLIFrameElement;
    expect(frame.getAttribute("sandbox")).toBe("allow-scripts");
    expect(frame.getAttribute("srcdoc")).toContain("hello live");
    expect(frame.getAttribute("srcdoc")).toContain("default-src 'none'");
  });

  it("wraps code with a strict CSP and never lets it break out of the document", () => {
    const doc = wrapArtifact("</html><script>1</script>");
    expect(doc.startsWith("<!doctype html>")).toBe(true);
    expect(doc).toContain("default-src 'none'");
    expect(doc).not.toMatch(/https:/);
  });
});

describe("native shells skip the landing page", () => {
  it("detects Capacitor and Tauri, not a normal browser", () => {
    expect(isNativeShell({})).toBe(false);
    expect(isNativeShell({ Capacitor: { isNativePlatform: () => true } })).toBe(true);
    expect(isNativeShell({ Capacitor: { isNativePlatform: () => false } })).toBe(false);
    expect(isNativeShell({ __TAURI_INTERNALS__: {} })).toBe(true);
  });
});
