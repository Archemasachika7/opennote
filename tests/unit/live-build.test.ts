import { detectArtifactType, stripFence, bareImports, titleOf } from "../../src/live/detect";
import { buildCsp, buildSrcdoc } from "../../src/live/srcdoc";

const FENCE = "`".repeat(3);
const vendor = { react: "/*REACT_UMD*/", reactDom: "/*REACTDOM_UMD*/", babel: "/*BABEL*/" };

describe("detect", () => {
  it("detects html, react, svg and nothing", () => {
    expect(detectArtifactType("<!DOCTYPE html><html><body>x</body></html>")).toBe("html");
    expect(detectArtifactType(`${FENCE}jsx\nexport default function A(){return <div/>}\n${FENCE}`)).toBe("react");
    expect(detectArtifactType("<svg viewBox=\"0 0 10 10\"><circle r=\"4\"/></svg>")).toBe("svg");
    expect(detectArtifactType("hello")).toBeNull();
    expect(detectArtifactType("<div><script>1</script></div>")).toBe("html");
    expect(detectArtifactType("import React, { useState } from 'react';\nconst App = () => <p/>;\nexport default App;")).toBe("react");
  });
  it("stripFence removes one surrounding fence", () => {
    expect(stripFence(`${FENCE}html\n<p>x</p>\n${FENCE}`)).toBe("<p>x</p>");
    expect(stripFence("<p>x</p>")).toBe("<p>x</p>");
  });
  it("bareImports lists third-party packages only", () => {
    expect(bareImports("import {LineChart} from 'recharts'; import React from 'react'; import x from './x'; import y from \"https://a.b/c.js\"; import { motion } from \"framer-motion\";"))
      .toEqual(["recharts", "framer-motion"]);
    expect(bareImports("import { Camera } from 'lucide-react/icons'; import 'react-dom/client';")).toEqual(["lucide-react/icons"]);
  });
  it("titleOf prefers <title>, then h1, then component name", () => {
    expect(titleOf("<title>Waves</title><h1>X</h1>", "html")).toBe("Waves");
    expect(titleOf("<h1>Big <b>Bang</b></h1>", "html")).toBe("Big Bang");
    expect(titleOf("export default function OrbitSim() {}", "react")).toBe("Orbit Sim");
    expect(titleOf("<p/>", "html")).toBe("Live page");
  });
});

describe("csp", () => {
  it("offline policy has no https sources", () => {
    const c = buildCsp({ allowNetwork: false });
    expect(c).toContain("default-src 'none'");
    expect(c).toContain("script-src 'unsafe-inline' blob:");
    expect(c).not.toContain("https:");
  });
  it("network policy adds https and connect-src", () => {
    const c = buildCsp({ allowNetwork: true });
    expect(c).toContain("script-src 'unsafe-inline' blob: https:");
    expect(c).toContain("connect-src https:");
  });
});

describe("buildSrcdoc", () => {
  const parse = (html: string) => new DOMParser().parseFromString(html, "text/html");

  it("html: CSP meta is the first element in head", () => {
    const doc = parse(buildSrcdoc({ source: "<html><head><title>T</title></head><body><p>x</p></body></html>", type: "html", allowNetwork: false }));
    const first = doc.head.firstElementChild!;
    expect(first.getAttribute("http-equiv")).toBe("Content-Security-Policy");
    expect(first.getAttribute("content")).not.toContain("https:");
    expect(doc.body.querySelector("p")?.textContent).toBe("x");
  });

  it("html without head gets one", () => {
    const out = buildSrcdoc({ source: "<p>bare</p>", type: "html", allowNetwork: false });
    expect(parse(out).head.firstElementChild?.getAttribute("http-equiv")).toBe("Content-Security-Policy");
  });

  it("svg is wrapped", () => {
    const doc = parse(buildSrcdoc({ source: "<svg width=\"10\"></svg>", type: "svg", allowNetwork: false }));
    expect(doc.body.querySelector("svg")).not.toBeNull();
  });

  it("react: inlines vendor scripts, has #root, import map only maps esm.sh when network is on", () => {
    const src = "import { LineChart } from 'recharts';\nexport default function A(){ return <div>hi</div>; }";
    const off = buildSrcdoc({ source: src, type: "react", allowNetwork: false, vendor });
    expect(off).toContain("/*REACT_UMD*/");
    expect(off).toContain("/*REACTDOM_UMD*/");
    expect(off).toContain("/*BABEL*/");
    expect(parse(off).getElementById("root")).not.toBeNull();
    expect(off).not.toContain("esm.sh/recharts");
    const on = buildSrcdoc({ source: src, type: "react", allowNetwork: true, vendor });
    expect(on).toContain("https://esm.sh/recharts?external=react,react-dom");
  });

  it("embeds a source containing a closing script tag safely", () => {
    const src = "export default function A(){ const s = \"</script><img src=x onerror=alert(1)>\"; return <p>{s}</p>; }";
    const out = buildSrcdoc({ source: src, type: "react", allowNetwork: false, vendor });
    const doc = parse(out);
    expect(doc.querySelectorAll("img").length).toBe(0);
    expect(doc.querySelectorAll("script").length).toBe(4);
  });

  it("tailwind CDN only with network and className usage", () => {
    const src = "export default function A(){ return <div className=\"p-4 text-xl\">x</div>; }";
    expect(buildSrcdoc({ source: src, type: "react", allowNetwork: true, vendor })).toContain("cdn.tailwindcss.com");
    expect(buildSrcdoc({ source: src, type: "react", allowNetwork: false, vendor })).not.toContain("cdn.tailwindcss.com");
  });

  it("every document reports its height", () => {
    expect(buildSrcdoc({ source: "<p/>", type: "html", allowNetwork: false })).toContain("opennote:height");
  });
});

describe("CSP placement cannot be bypassed", () => {
  const head = '<!DOCTYPE html><meta http-equiv="Content-Security-Policy"';
  it("a script before <html> is still covered", () => {
    const out = buildSrcdoc({ source: "<script>fetch('https://x')</script><html><head></head><body></body></html>", type: "html", allowNetwork: false });
    expect(out.startsWith(head)).toBe(true);
  });
  it("a <head> inside a leading comment does not swallow the CSP", () => {
    const out = buildSrcdoc({ source: "<!-- <head> --><html><head><title>t</title></head><body>x</body></html>", type: "html", allowNetwork: false });
    expect(out.startsWith(head)).toBe(true);
    expect(new DOMParser().parseFromString(out, "text/html").querySelector('meta[http-equiv="Content-Security-Policy"]')).not.toBeNull();
  });
  it("an existing doctype is not duplicated", () => {
    const out = buildSrcdoc({ source: "<!doctype html><html><body>x</body></html>", type: "html", allowNetwork: false });
    expect(out.match(/<!doctype/gi)).toHaveLength(1);
  });
});

describe("capture-enabled documents (PDF export)", () => {
  it("include the capture library and a capture handler only when asked", () => {
    const plain = buildSrcdoc({ source: "<p>x</p>", type: "html", allowNetwork: false });
    expect(plain).not.toContain("opennote:capture");
    const cap = buildSrcdoc({ source: "<p>x</p>", type: "html", allowNetwork: false, capture: "/*H2C*/" });
    expect(cap).toContain("/*H2C*/");
    expect(cap).toContain("opennote:capture-result");
    expect(cap.indexOf("Content-Security-Policy")).toBeLessThan(cap.indexOf("/*H2C*/"));
  });
});
