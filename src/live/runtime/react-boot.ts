/** Makes text safe to place inside an inline <script>: no closing tags or HTML comment openers. */
export function scriptSafe(js: string): string {
  return js.replace(/<\/(script)/gi, "<\\/$1").replace(/<!--/g, "<\\!--");
}

/**
 * Bootstrap that runs INSIDE the sandbox: transpile the artifact with Babel, map react/react-dom
 * to the bundled UMD globals through blob-URL shim modules + an import map, import it, mount the default export.
 */
export function reactBootScript(userCode: string, importMap: Record<string, string>): string {
  const code = scriptSafe(JSON.stringify(userCode));
  const map = scriptSafe(JSON.stringify(importMap));
  return String.raw`(async function () {
  var root = document.getElementById("root");
  function fail(err) {
    var pre = document.createElement("pre");
    pre.className = "on-error";
    pre.textContent = String((err && (err.message || err)) || "Unknown error");
    root.innerHTML = "";
    root.appendChild(pre);
  }
  window.addEventListener("error", function (ev) { fail(ev.error || ev.message); });
  window.addEventListener("unhandledrejection", function (ev) { fail(ev.reason); });
  try {
    var blobUrl = function (src) { return URL.createObjectURL(new Blob([src], { type: "text/javascript" })); };
    var ident = /^[A-Za-z_$][\w$]*$/;
    var reexport = function (globalName) {
      var g = window[globalName];
      var names = Object.keys(g).filter(function (k) { return ident.test(k) && k !== "default"; });
      return "const G = window." + globalName + "; export default G; " +
        names.map(function (k) { return "export const " + k + " = G." + k + ";"; }).join(" ");
    };
    var jsxRuntime = "const R = window.React; export const Fragment = R.Fragment;" +
      " function jsx(t, p, k) { p = p || {}; var c = p.children; var q = Object.assign({}, p); delete q.children;" +
      " if (k !== undefined) q.key = k; return Array.isArray(c) ? R.createElement.apply(null, [t, q].concat(c)) : c === undefined ? R.createElement(t, q) : R.createElement(t, q, c); }" +
      " export { jsx, jsx as jsxs, jsx as jsxDEV };";
    var imports = Object.assign({
      "react": blobUrl(reexport("React")),
      "react-dom": blobUrl(reexport("ReactDOM")),
      "react-dom/client": blobUrl(reexport("ReactDOM")),
      "react/jsx-runtime": blobUrl(jsxRuntime),
      "react/jsx-dev-runtime": blobUrl(jsxRuntime)
    }, ${map});
    var im = document.createElement("script");
    im.type = "importmap";
    im.textContent = JSON.stringify({ imports: imports });
    document.head.appendChild(im);
    var src = ${code};
    var out = Babel.transform(src, {
      presets: [["react", { runtime: "classic" }], ["typescript", { isTSX: true, allExtensions: true }]],
      filename: "artifact.tsx"
    }).code;
    if (!/import\s+(\*\s+as\s+)?React\b/.test(out)) out = 'import React from "react";\n' + out;
    var mod = await import(blobUrl(out));
    var C = mod.default;
    if (!C) throw new Error("No default export. Add: export default function App() { ... }");
    ReactDOM.createRoot(root).render(React.createElement(C));
  } catch (e) { fail(e); }
})();`;
}
