import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./ui/global.css";
import { App } from "./App";
import { installPlatform } from "./platform/install";

void installPlatform();

createRoot(document.getElementById("root")!).render(<StrictMode><App /></StrictMode>);
