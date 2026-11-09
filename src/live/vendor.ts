import type { Vendor } from "./srcdoc";

let cache: Promise<Vendor> | null = null;

async function text(name: string): Promise<string> {
  const res = await fetch(`${import.meta.env.BASE_URL}vendor/${name}`);
  if (!res.ok) throw new Error(`Could not load sandbox runtime (${name}): ${res.status}`);
  return res.text();
}

/** Bundled React 18 UMD + Babel standalone (public/vendor), fetched the first time a React page runs. */
export function loadVendor(): Promise<Vendor> {
  cache ??= Promise.all([text("react.js"), text("react-dom.js"), text("babel.js")])
    .then(([react, reactDom, babel]) => ({ react, reactDom, babel }))
    .catch((e) => { cache = null; throw e; });
  return cache;
}
