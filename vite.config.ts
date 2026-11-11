/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

/**
 * One ONNX runtime for the whole app. transformers.js (handwriting, speech) brings its own copy and
 * imports `onnxruntime-web/webgpu`; ink-on (handwritten maths) imports plain `onnxruntime-web` and would
 * pull a second copy with another ~30 MB .wasm. Point ink-on at transformers' copy (its WebGPU build also
 * runs on plain WebAssembly). Found at build time, so it still works if npm hoists the package.
 */
const ortDir = [resolve("node_modules/@huggingface/transformers/node_modules/onnxruntime-web"), resolve("node_modules/onnxruntime-web")]
  .find((d) => existsSync(resolve(d, "dist/ort.webgpu.bundle.min.mjs")));
const ortAlias = ortDir ? [{ find: /^onnxruntime-web$/, replacement: resolve(ortDir, "dist/ort.webgpu.bundle.min.mjs") }] : [];

export default defineConfig({
  plugins: [react()],
  resolve: { alias: ortAlias },
  server: {
    host: "0.0.0.0",
    port: 5173,
    strictPort: true,
    allowedHosts: true,
    cors: true,
  },
  preview: {
    host: "0.0.0.0",
    port: 5173,
    strictPort: true,
    allowedHosts: true,
    cors: true,
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
