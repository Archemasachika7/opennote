/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    host: "0.0.0.0",
    port: 5173,
    strictPort: true,
    allowedHosts: true,
  },
  preview: {
    host: "0.0.0.0",
    port: 5173,
    strictPort: true,
    allowedHosts: true,
  },
  build: {
    rolldownOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules/@tiptap") || id.includes("node_modules/prosemirror")) return "tiptap";
          if (id.includes("node_modules/pdf-lib") || id.includes("node_modules/html2canvas")) return "export-vendor";
          if (id.includes("node_modules/motion")) return "motion";
        },
      },
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    // the first test in a file imports the whole app graph (TipTap, motion, pdf libs): give cold starts room
    testTimeout: 15_000,
    globals: true,
    include: ["tests/unit/**/*.test.{ts,tsx}"],
  },
});
