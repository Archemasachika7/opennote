/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    // the first test in a file imports the whole app graph (TipTap, motion, pdf libs): give cold starts room
    testTimeout: 15_000,
    globals: true,
    include: ["tests/unit/**/*.test.{ts,tsx}"],
  },
});
