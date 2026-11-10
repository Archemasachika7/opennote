import "fake-indexeddb/auto";
import { describe, expect, it, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { App, useRoute } from "../../src/App";
import { db } from "../../src/store/schema";
import { listNotebooks } from "../../src/store/notebooks";
import { renderHook } from "@testing-library/react";

describe("Landing Page (21st.dev architectural studio, zero auth wall)", () => {
  beforeEach(async () => {
    await Promise.all(db.tables.map((t) => t.clear()));
    window.location.hash = "";
  });

  it("renders the Landing Page at fresh root URL ('') and at #/welcome, while keeping #/ as the Studio Library", async () => {
    window.location.hash = "";
    const { unmount } = render(<App />);
    expect(screen.getByTestId("landing-page")).toBeInTheDocument();
    expect(screen.getByTestId("hero-ink-canvas")).toBeInTheDocument();
    // No auth wall / login gate
    expect(screen.queryByRole("button", { name: /sign up|log in/i })).toBeNull();

    // Clicking Enter Studio navigates to #/ (LibraryView)
    fireEvent.click(screen.getByRole("button", { name: /enter studio/i }));
    await waitFor(() => expect(window.location.hash).toBe("#/"));
    expect(await screen.findByRole("heading", { name: "OpenNote" })).toBeInTheDocument();
    unmount();

    // Explicit #/welcome route also opens the Landing Page
    act(() => {
      window.location.hash = "#/welcome";
      window.dispatchEvent(new HashChangeEvent("hashchange"));
    });
    const { result } = renderHook(() => useRoute());
    expect(result.current).toEqual({ name: "landing" });
  });

  it("creates a real blank notebook immediately from 'New Blank Page' without any auth step", async () => {
    window.location.hash = "#/welcome";
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: /new blank page/i }));

    await waitFor(async () => {
      const nbs = await listNotebooks();
      expect(nbs.length).toBe(1);
      expect(window.location.hash).toBe(`#/nb/${nbs[0].id}`);
    });
  });

  it("launches the 3-page interactive demo notebook from 'Open 3-Page Demo'", async () => {
    window.location.hash = "#/welcome";
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: /open 3-page demo/i }));

    await waitFor(async () => {
      const nbs = await listNotebooks();
      expect(nbs.length).toBe(1);
      expect(nbs[0].title).toBe("Welcome to OpenNote");
      expect(window.location.hash).toBe(`#/nb/${nbs[0].id}`);
    });
  });

  it("supports interactive Bento primitives (Shape fill swatches, Sarvam language tabs, and Study Tape peel)", () => {
    window.location.hash = "#/welcome";
    render(<App />);

    // 1. Toggle Solid shape fill in Bento primitive 01
    const solidToggle = screen.getByRole("button", { name: /bento solid fill/i });
    fireEvent.click(solidToggle);
    expect(solidToggle).toHaveAttribute("aria-pressed", "true");

    // 2. Switch Sarvam STT preview tab to Bengali
    const bnTab = screen.getByRole("tab", { name: /bengali/i });
    fireEvent.click(bnTab);
    expect(bnTab).toHaveAttribute("aria-selected", "true");

    // 3. Peel Study Tape occlusion strip in Bento primitive 05
    const tapeBtn = screen.getByRole("button", { name: /peel study tape/i });
    fireEvent.click(tapeBtn);
    expect(screen.getByText(/FSRS-4\.5 interval/i)).toBeInTheDocument();
  });
});

describe("landing downloads and film", () => {
  it("links straight to the APK and EXE that CI attaches to the latest release, and shows the launch film", async () => {
    window.location.hash = "#/welcome";
    render(<App />);
    const apk = await screen.findByRole("link", { name: /android/i });
    const exe = screen.getByRole("link", { name: /windows/i });
    expect(apk.getAttribute("href")).toBe("https://github.com/Archemasachika7/opennote/releases/latest/download/OpenNote-android.apk");
    expect(exe.getAttribute("href")).toBe("https://github.com/Archemasachika7/opennote/releases/latest/download/OpenNote-windows-setup.exe");
    expect(document.querySelector("video source")?.getAttribute("src")).toBe("/media/opennote-launch.mp4");
  });
});
