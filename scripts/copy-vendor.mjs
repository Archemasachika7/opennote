// Copies the sandbox runtime (React 18 UMD + Babel standalone) into public/vendor so the app can
// fetch it as text at runtime. Runs before dev/build/test.
import { copyFileSync, mkdirSync } from "node:fs";

const files = {
  "react.js": "node_modules/react/umd/react.production.min.js",
  "react-dom.js": "node_modules/react-dom/umd/react-dom.production.min.js",
  "babel.js": "node_modules/@babel/standalone/babel.min.js",
  "html2canvas.js": "node_modules/html2canvas/dist/html2canvas.min.js",
  // on-device Whisper: the ONNX runtime is served by the app itself, so transcription works offline
  "ort/ort-wasm-simd-threaded.jsep.mjs": "node_modules/@huggingface/transformers/dist/ort-wasm-simd-threaded.jsep.mjs",
  "ort/ort-wasm-simd-threaded.jsep.wasm": "node_modules/@huggingface/transformers/dist/ort-wasm-simd-threaded.jsep.wasm",
};
mkdirSync("public/vendor/ort", { recursive: true });
for (const [out, src] of Object.entries(files)) copyFileSync(src, `public/vendor/${out}`);
console.log("vendor runtime copied to public/vendor");
