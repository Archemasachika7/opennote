// Copies the sandbox runtime (React 18 UMD + Babel standalone) into public/vendor so the app can
// fetch it as text at runtime. Runs before dev/build/test.
import { copyFileSync, mkdirSync } from "node:fs";

const files = {
  "react.js": "node_modules/react/umd/react.production.min.js",
  "react-dom.js": "node_modules/react-dom/umd/react-dom.production.min.js",
  "babel.js": "node_modules/@babel/standalone/babel.min.js",
};
mkdirSync("public/vendor", { recursive: true });
for (const [out, src] of Object.entries(files)) copyFileSync(src, `public/vendor/${out}`);
console.log("vendor runtime copied to public/vendor");
