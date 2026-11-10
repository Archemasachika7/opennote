import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./ui/global.css";
import { App } from "./App";
import { installPlatform } from "./platform/install";
import { initTheme } from "./ui/theme";
import { initAuth } from "./sync/auth";

initTheme();
void installPlatform();
// optional sign-in: restores a saved session; does nothing when Supabase isn't configured
void initAuth().catch(() => undefined);

if (import.meta.env.PROD && typeof navigator !== "undefined" && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    void navigator.serviceWorker.register("/sw.js").catch(() => undefined);
  });
}

createRoot(document.getElementById("root")!).render(<StrictMode><App /></StrictMode>);
