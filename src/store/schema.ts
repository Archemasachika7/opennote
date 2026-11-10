import Dexie, { type Table } from "dexie";
import type { Stroke } from "../ink/model";
import type { Layer } from "../ink/layers";
import type { Srs } from "../study/srs";

export type Paper = "dark" | "light";
export type Template = "blank" | "ruled" | "grid" | "dot";
export type ArtifactType = "html" | "svg" | "react";
export const PAGE_SIZE = { w: 1404, h: 1872 } as const;
export const MAX_HTML_BYTES = 5 * 1024 * 1024;

export interface Folder { id: string; name: string; parentId: string | null; createdAt: number }

export interface Notebook {
  id: string;
  title: string;
  coverColor: string;
  paper: Paper;
  folderId: string | null;
  bookmarks: string[];
  pageIds: string[];
  createdAt: number;
  updatedAt: number;
  /** Library favourite (absent on older notebooks = false). */
  favorite?: boolean;
  /** When it was moved to Trash; absent/null = not in Trash. */
  trashedAt?: number | null;
  /** Document type (absent = notebook). Whiteboard pages are boards; a study set has cards, no pages. */
  kind?: DocKind;
}
export type DocKind = "notebook" | "whiteboard" | "studyset";

interface PageBase {
  id: string;
  notebookId: string;
  createdAt: number;
  updatedAt: number;
  size: { w: number; h: number };
}
/** Imported PDF page shown under the ink (never erasable); text is kept for search. */
export interface PageBackground { blobId: string; pdfText?: string; /** degrees clockwise: 0, 90, 180, 270 */ rotation?: number }
export interface InkPage extends PageBase {
  kind: "ink"; template: Template; background?: PageBackground;
  /** Content layers, bottom to top (absent = one default layer). */
  layers?: Layer[];
  /** Whiteboard board: an infinite canvas instead of a fixed page. */
  board?: boolean;
  /** Board name (whiteboards). */
  title?: string;
  /** Background colour override (whiteboards). */
  bgColor?: string;
}
export interface TextPage extends PageBase { kind: "text"; doc: unknown | null }
export interface HtmlPage extends PageBase {
  kind: "html";
  title: string;
  source: string;
  artifactType: ArtifactType;
  allowNetwork: boolean;
  height: number;
  snapshotBlobId?: string;
}
export type Page = InkPage | TextPage | HtmlPage;
export type PagePatch = Partial<Omit<InkPage, "kind" | "id">> & Partial<Omit<TextPage, "kind" | "id">> &
  Partial<Omit<HtmlPage, "kind" | "id">>;

export type NewPage =
  | { kind: "ink"; template: Template; background?: PageBackground; size?: { w: number; h: number }; board?: boolean; title?: string }
  | { kind: "text" }
  | { kind: "html"; title: string; source: string; artifactType: ArtifactType; allowNetwork: boolean };

export interface StrokeRow { id: string; pageId: string; stroke: Stroke }

export interface PageObject {
  id: string;
  pageId: string;
  kind: "image" | "textbox" | "tape";
  x: number; y: number; w: number; h: number;
  rotation: number;
  crop?: { x: number; y: number; w: number; h: number };
  blobId?: string;
  text?: string;
  z: number;
  layerId?: string;
  /** Tape: colour, and whether it is currently peeled back. */
  color?: string;
  revealed?: boolean;
}

/** A flashcard in a study set (notebookId = the set). */
export interface Card {
  id: string;
  notebookId: string;
  order: number;
  front: string;
  back: string;
  frontImage?: string;
  backImage?: string;
  srs: Srs;
  createdAt: number;
  updatedAt: number;
}

export interface BlobRow { id: string; data: Blob }

class OpenNoteDB extends Dexie {
  notebooks!: Table<Notebook, string>;
  pages!: Table<Page, string>;
  strokes!: Table<StrokeRow, string>;
  objects!: Table<PageObject, string>;
  blobs!: Table<BlobRow, string>;
  folders!: Table<Folder, string>;
  cards!: Table<Card, string>;
  constructor() {
    super("opennote");
    this.version(1).stores({
      notebooks: "id, folderId, updatedAt, title",
      pages: "id, notebookId",
      strokes: "id, pageId",
      objects: "id, pageId",
      blobs: "id",
      folders: "id, parentId",
    });
    this.version(2).stores({ cards: "id, notebookId" });
  }
}

export const db = new OpenNoteDB();
export const newId = (): string => crypto.randomUUID();
export const now = (): number => Date.now();

/** Of the given blob ids, those no object or page background references any more (safe to delete). */
export async function unreferencedBlobs(candidates: string[]): Promise<string[]> {
  const want = new Set(candidates);
  if (want.size === 0) return [];
  const used = new Set<string>();
  await db.objects.each((o) => { if (o.blobId && want.has(o.blobId)) used.add(o.blobId); });
  await db.cards.each((c) => { for (const b of [c.frontImage, c.backImage]) if (b && want.has(b)) used.add(b); });
  await db.pages.each((p) => { if (p.kind === "ink" && p.background && want.has(p.background.blobId)) used.add(p.background.blobId); });
  return [...want].filter((b) => !used.has(b));
}
