import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";

type Listener = (event: string, session: { user: { id: string; email: string } } | null) => void;
const listeners: Listener[] = [];
const fake = {
  auth: {
    getSession: vi.fn(async () => ({ data: { session: null }, error: null })),
    onAuthStateChange: vi.fn((cb: Listener) => { listeners.push(cb); return { data: { subscription: { unsubscribe: vi.fn() } } }; }),
    signInWithOtp: vi.fn(async () => ({ data: {}, error: null as null | { message: string } })),
    verifyOtp: vi.fn(async () => ({ data: { user: { id: "u1", email: "a@b.co" }, session: {} }, error: null as null | { message: string } })),
    signInWithOAuth: vi.fn(async () => ({ data: { url: "https://accounts.example/x" }, error: null })),
    signOut: vi.fn(async () => ({ error: null })),
  },
};
let enabled = true;
vi.mock("../../src/sync/supabase", () => ({ get supabase() { return enabled ? fake : null; } }));

async function freshAuth() {
  vi.resetModules();
  return import("../../src/sync/auth");
}

beforeEach(() => {
  enabled = true;
  listeners.length = 0;
  vi.clearAllMocks();
});

describe("auth state flow", () => {
  it("is 'disabled' when Supabase is not configured", async () => {
    enabled = false;
    const a = await freshAuth();
    expect(a.getAuthState().status).toBe("disabled");
    await expect(a.sendCode("a@b.co")).rejects.toThrow(/not available/i);
  });

  it("signed-out → code-sent → signed-in → signed-out", async () => {
    const a = await freshAuth();
    await a.initAuth();
    expect(a.getAuthState().status).toBe("signed-out");

    await a.sendCode(" a@b.co ");
    expect(fake.auth.signInWithOtp).toHaveBeenCalledWith({ email: "a@b.co", options: { shouldCreateUser: true } });
    expect(a.getAuthState()).toMatchObject({ status: "code-sent", email: "a@b.co" });

    await a.verifyCode("a@b.co", "123456");
    expect(fake.auth.verifyOtp).toHaveBeenCalledWith({ email: "a@b.co", token: "123456", type: "email" });
    expect(a.getAuthState()).toMatchObject({ status: "signed-in", user: { id: "u1", email: "a@b.co" } });

    await a.signOut();
    expect(a.getAuthState().status).toBe("signed-out");
  });

  it("follows Supabase auth events (e.g. another tab or OAuth return)", async () => {
    const a = await freshAuth();
    await a.initAuth();
    act(() => listeners.forEach((l) => l("SIGNED_IN", { user: { id: "u2", email: "x@y.io" } })));
    expect(a.getAuthState()).toMatchObject({ status: "signed-in", user: { id: "u2" } });
    act(() => listeners.forEach((l) => l("SIGNED_OUT", null)));
    expect(a.getAuthState().status).toBe("signed-out");
  });

  it("rejects bad emails and codes before calling Supabase", async () => {
    const a = await freshAuth();
    await expect(a.sendCode("not-an-email")).rejects.toThrow(/email/i);
    await expect(a.verifyCode("a@b.co", "12345")).rejects.toThrow(/6-digit/i);
    await expect(a.verifyCode("a@b.co", "12a456")).rejects.toThrow(/6-digit/i);
    expect(fake.auth.signInWithOtp).not.toHaveBeenCalled();
    expect(fake.auth.verifyOtp).not.toHaveBeenCalled();
  });

  it("surfaces Supabase errors and stays in the previous state", async () => {
    const a = await freshAuth();
    await a.initAuth();
    fake.auth.signInWithOtp.mockResolvedValueOnce({ data: {}, error: { message: "rate limited" } });
    await expect(a.sendCode("a@b.co")).rejects.toThrow("rate limited");
    expect(a.getAuthState().status).toBe("signed-out");
  });
});

describe("AccountSheet", () => {
  async function renderSheet() {
    const a = await freshAuth();
    await a.initAuth();
    const { AccountSheet } = await import("../../src/ui/AccountSheet");
    render(<AccountSheet open onClose={() => {}} />);
    return a;
  }

  it("keeps 'Send code' disabled until the email is valid", async () => {
    await renderSheet();
    const send = screen.getByRole("button", { name: /send code/i }) as HTMLButtonElement;
    expect(send.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: "nope" } });
    expect(send.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: "a@b.co" } });
    expect(send.disabled).toBe(false);
    expect(screen.getByText(/your notes stay on this device/i)).toBeTruthy();
  });

  it("asks for a 6-digit code after sending, then shows the account", async () => {
    await renderSheet();
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: "a@b.co" } });
    fireEvent.click(screen.getByRole("button", { name: /send code/i }));
    const group = await screen.findByRole("group", { name: /6-digit code/i });
    const boxes = Array.from(group.querySelectorAll("input"));
    expect(boxes).toHaveLength(6);
    const signIn = screen.getByRole("button", { name: /^sign in$/i }) as HTMLButtonElement;
    // typing moves focus forward; letters are ignored
    fireEvent.change(boxes[0], { target: { value: "1" } });
    expect(document.activeElement).toBe(boxes[1]);
    fireEvent.change(boxes[1], { target: { value: "x" } });
    expect(boxes[1].value).toBe("");
    expect(signIn.disabled).toBe(true);
    // pasting the whole code fills every box
    fireEvent.paste(boxes[0], { clipboardData: { getData: () => " 123 456 " } });
    expect(boxes.map((b) => b.value).join("")).toBe("123456");
    expect(signIn.disabled).toBe(false);
    // backspace on an empty box goes back
    fireEvent.click(signIn);
    await waitFor(() => expect(screen.getByRole("button", { name: /sign out/i })).toBeTruthy());
    expect(screen.getByText("a@b.co")).toBeTruthy();
    expect(screen.getByText(/sync: coming soon/i)).toBeTruthy();
  });
});

describe("OtpInput", () => {
  it("backspace on an empty box clears the previous one and moves back", async () => {
    const { OtpInput } = await import("../../src/ui/OtpInput");
    const seen: string[] = [];
    render(<OtpInput value="12" onChange={(v) => seen.push(v)} />);
    const boxes = Array.from(screen.getByRole("group", { name: /6-digit code/i }).querySelectorAll("input"));
    boxes[2].focus();
    fireEvent.keyDown(boxes[2], { key: "Backspace" });
    expect(seen.at(-1)).toBe("1");
    expect(document.activeElement).toBe(boxes[1]);
  });
});

describe("resend timer", () => {
  it("offers 'Resend code' only after 30 s", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const a = await freshAuth();
      await a.initAuth();
      const { AccountSheet } = await import("../../src/ui/AccountSheet");
      render(<AccountSheet open onClose={() => {}} />);
      fireEvent.change(screen.getByLabelText(/email/i), { target: { value: "a@b.co" } });
      fireEvent.click(screen.getByRole("button", { name: /send code/i }));
      const resend = (await screen.findByRole("button", { name: /resend/i })) as HTMLButtonElement;
      expect(resend.disabled).toBe(true);
      await act(async () => { vi.advanceTimersByTime(30_000); });
      expect(resend.disabled).toBe(false);
      fireEvent.click(resend);
      await waitFor(() => expect(fake.auth.signInWithOtp).toHaveBeenCalledTimes(2));
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("library account button", () => {
  it("is hidden when Supabase is not configured, and the library still renders", async () => {
    enabled = false;
    vi.resetModules();
    const { LibraryView } = await import("../../src/library/LibraryView");
    render(<LibraryView />);
    await screen.findByRole("button", { name: /new notebook/i });
    expect(screen.queryByRole("button", { name: /account/i })).toBeNull();
  });

  it("shows when Supabase is configured", async () => {
    vi.resetModules();
    const { LibraryView } = await import("../../src/library/LibraryView");
    render(<LibraryView />);
    expect(await screen.findByRole("button", { name: /account/i })).toBeTruthy();
  });
});

describe("secrets", () => {
  function files(dir: string): string[] {
    return readdirSync(dir).flatMap((f) => {
      const p = join(dir, f);
      return statSync(p).isDirectory() ? files(p) : [p];
    });
  }
  it("never mentions the service role key in client code", () => {
    for (const f of files("src")) expect(readFileSync(f, "utf8"), f).not.toMatch(/service_role|SERVICE_ROLE/);
  });
});
