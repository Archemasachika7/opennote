import { db, type InkPage } from "./schema";
import { getStrokes } from "./strokes";
import { recognizeText } from "../ai/inkOcr";

/**
 * Read a page's handwriting on this device and keep it for search. It writes only the search fields,
 * not updatedAt, so reading never looks like an edit (no sync upload, no re-read loop).
 */
export async function indexHandwriting(pageId: string, onStatus?: (s: string) => void): Promise<string> {
  const text = await recognizeText(await getStrokes(pageId), onStatus);
  await db.pages.update(pageId, { inkText: text, inkTextAt: Date.now() } as Partial<InkPage>);
  return text;
}
