import Dexie, { type Table } from "dexie";
import type { Stroke } from "../ink/model";

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
}

interface PageBase {
  id: string;
  notebookId: string;
  createdAt: number;
  updatedAt: number;
  size: { w: number; h: number };
}
/** Imported PDF page shown under the ink (never erasable); text is kept for search. */
export interface PageBackground { blobId: string; pdfText?: string }
export interface InkPage extends PageBase { kind: "ink"; template: Template; background?: PageBackground }
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
  | { kind: "ink"; template: Template }
  | { kind: "text" }
  | { kind: "html"; title: string; source: string; artifactType: ArtifactType; allowNetwork: boolean };

export interface StrokeRow { id: string; pageId: string; stroke: Stroke }

export interface PageObject {
  id: string;
  pageId: string;
  kind: "image" | "textbox";
  x: number; y: number; w: number; h: number;
  rotation: number;
  crop?: { x: number; y: number; w: number; h: number };
  blobId?: string;
  text?: string;
  z: number;
}

export interface BlobRow { id: string; data: Blob }

class OpenNoteDB extends Dexie {
  notebooks!: Table<Notebook, string>;
  pages!: Table<Page, string>;
  strokes!: Table<StrokeRow, string>;
  objects!: Table<PageObject, string>;
  blobs!: Table<BlobRow, string>;
  folders!: Table<Folder, string>;
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
  }
}

export const db = new OpenNoteDB();
export const newId = (): string => crypto.randomUUID();
export const now = (): number => Date.now();
