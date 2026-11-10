import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./ui/global.css";
import { App } from "./App";
import { installPlatform } from "./platform/install";
import { initTheme } from "./ui/theme";
import { initAuth } from "./sync/auth";
import { startSyncLoop } from "./sync/run";
import { startServiceWorker } from "./platform/serviceWorker";

initTheme();
void installPlatform();
// optional sign-in: restores a saved session; does nothing when Supabase isn't configured
void initAuth().catch(() => undefined);
// encrypted sync: idles until signed in and unlocked with the sync passphrase
startSyncLoop();

// offline cache on the website; inside the Android and Windows apps it is removed instead (see serviceWorker.ts)
if (import.meta.env.PROD) startServiceWorker();

createRoot(document.getElementById("root")!).render(<StrictMode><App /></StrictMode>);
