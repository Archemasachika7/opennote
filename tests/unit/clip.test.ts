import "fake-indexeddb/auto";
import { db } from "../../src/store/schema";
import { createNotebook } from "../../src/store/notebooks";
import { getPages } from "../../src/store/pages";
import { extractArticle, findUrl, normalizeUrl, toTextDoc } from "../../src/clip/extract";
import { clipUrl, ClipBlockedError } from "../../src/clip/clip";
import { readShareParams, toShared } from "../../src/clip/SharedClipHost";

const ARTICLE = `<!doctype html><html><head>
  <title>Photosynthesis explained | Science Daily</title>
  <meta property="og:title" content="Photosynthesis explained">
  <meta property="og:site_name" content="Science Daily">
  <meta name="description" content="How plants turn light into sugar.">
  <script>window.evil = 1</script><style>p{color:red}</style>
</head><body>
  <header><nav><a href="/">Home</a><a href="/news">News</a></nav></header>
  <div class="cookie-banner">We use cookies</div>
  <main>
    <article>
      <h1>Photosynthesis explained</h1>
      <p>Plants capture light energy with chlorophyll and store it as glucose. This is the opening paragraph of the story.</p>
      <h2>The two stages</h2>
      <ol><li>Light-dependent reactions</li><li>The Calvin cycle</li></ol>
      <blockquote>Without photosynthesis there would be no oxygen to breathe.</blockquote>
      <div class="share-buttons"><button>Share</button> Share on social</div>
      <pre>6CO2 + 6H2O -> C6H12O6 + 6O2</pre>
      <p>Most of this happens in the leaves, inside chloroplasts, which are packed with thylakoid membranes.</p>
      <img src="leaf.png" alt="leaf">
    </article>
  </main>
  <aside>Related stories</aside>
  <footer>© Science Daily</footer>
</body></html>`;

describe("extracting an article", () => {
  const a = extractArticle(ARTICLE, "https://www.sciencedaily.com/story");

  it("takes the title, site and summary from the page's meta tags", () => {
    expect(a.title).toBe("Photosynthesis explained");
    expect(a.site).toBe("Science Daily");
    expect(a.description).toBe("How plants turn light into sugar.");
  });

  it("keeps the article's headings, paragraphs, lists, quotes and code, in order", () => {
    expect(a.blocks.map((b) => b.t)).toEqual(["p", "h", "list", "quote", "code", "p"]);
    expect(a.blocks[1]).toEqual({ t: "h", level: 2, text: "The two stages" });
    expect(a.blocks[2]).toEqual({ t: "list", ordered: true, items: ["Light-dependent reactions", "The Calvin cycle"] });
  });

  it("leaves out scripts, menus, cookie banners, share bars, sidebars and footers", () => {
    const all = JSON.stringify(a);
    for (const junk of ["evil", "Home", "cookies", "Share on social", "Related stories", "©"]) expect(all).not.toContain(junk);
  });

  it("falls back to the block with the most paragraph text when there is no <article>", () => {
    const html = `<body><div id="menu"><p>Home</p></div><div class="content"><p>${"Long body text. ".repeat(20)}</p><p>Second paragraph of the body.</p></div></body>`;
    const b = extractArticle(html, "https://blog.example.org/post");
    expect(b.title).toBe("blog.example.org");
    expect(b.blocks.map((x) => x.t)).toEqual(["p", "p"]);
  });

  it("builds an editable Text page: title, source and date, then the article", () => {
    const doc = toTextDoc(a, "https://www.sciencedaily.com/story", new Date(2026, 10, 11)) as { content: { type: string; attrs?: { level?: number } }[] };
    const types = doc.content.map((n) => n.type);
    expect(types.slice(0, 4)).toEqual(["heading", "paragraph", "paragraph", "blockquote"]);
    expect(JSON.stringify(doc.content[1])).toContain("Science Daily · Clipped");
    expect(JSON.stringify(doc.content[2])).toContain("https://www.sciencedaily.com/story");
    expect(types).toContain("orderedList");
    expect(types).toContain("codeBlock");
    // article headings sit one level under the page title
    expect(doc.content.find((n, i) => i > 0 && n.type === "heading")?.attrs?.level).toBe(3);
  });
});

describe("links", () => {
  it("accepts web links, with or without https://", () => {
    expect(normalizeUrl("https://example.com/a?b=1")).toBe("https://example.com/a?b=1");
    expect(normalizeUrl("  example.com/page ")).toBe("https://example.com/page");
  });

  it("refuses anything that is not a web page link", () => {
    for (const bad of ["javascript:alert(1)", "mailto:a@b.com", "file:///etc/passwd", "data:text/html,hi", "hello", "two words.com", ""]) {
      expect(normalizeUrl(bad)).toBeNull();
    }
  });

  it("finds the link inside shared text", () => {
    expect(findUrl("Look at this https://youtu.be/abc123). Shared via app")).toBe("https://youtu.be/abc123");
    expect(findUrl("no link here")).toBeNull();
  });
});

describe("shared into OpenNote", () => {
  it("reads the installed web app's share parameters", () => {
    expect(readShareParams({ search: "?title=Cells&text=read%20this%20https%3A%2F%2Fbio.org%2Fcells" }))
      .toEqual({ url: "https://bio.org/cells", text: "read this https://bio.org/cells", title: "Cells" });
    expect(readShareParams({ search: "" })).toBeNull();
  });

  it("keeps plain shared text when there is no link, and ignores empty shares", () => {
    expect(toShared("Meeting notes: bring the lab book")).toEqual({ url: null, text: "Meeting notes: bring the lab book", title: "" });
    expect(toShared("   ")).toBeNull();
  });
});

describe("clipping into a notebook", () => {
  beforeEach(async () => { await Promise.all(db.tables.map((t) => t.clear())); });

  it("adds the article as a Text page at the chosen place", async () => {
    const nb = await createNotebook({ title: "Bio" });
    const r = await clipUrl(nb.id, 1, "https://www.sciencedaily.com/story", async () => ARTICLE);
    expect(r.article?.title).toBe("Photosynthesis explained");
    const pages = await getPages(nb.id);
    expect(pages.map((p) => p.kind)).toEqual(["ink", "text"]);
    expect(JSON.stringify(pages[1].kind === "text" && pages[1].doc)).toContain("Calvin cycle");
  });

  it("still keeps the link, with the reason, when the site refuses", async () => {
    const nb = await createNotebook({ title: "Bio" });
    const r = await clipUrl(nb.id, 1, "https://news.example.com/x", async () => { throw new ClipBlockedError("This site doesn't let browsers read it directly."); });
    expect(r.article).toBeNull();
    const [, page] = await getPages(nb.id);
    const json = JSON.stringify(page.kind === "text" && page.doc);
    expect(json).toContain("https://news.example.com/x");
    expect(json).toContain("Only the link was saved");
  });
});
