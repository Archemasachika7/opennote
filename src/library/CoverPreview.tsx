"use client";
import { db, PAGE_SIZE, type Notebook, type Page } from "../store/schema";
import { useLive } from "../store/useLive";
import { PageThumbCanvas } from "../notebook/PageThumbCanvas";
import { headingsOf } from "../text/outline";
import { textOf } from "../text/textOf";
import { useBlobUrl } from "../ui/useBlobUrl";

/**
 * The notebook's first page, drawn small on its library cover, so a cover shows what is inside
 * instead of an empty rectangle: real ink for ink pages (the same miniature the page panel uses),
 * the saved snapshot for a live page, the first heading or line for a text page.
 * Nothing for locked notebooks (their pages are encrypted and must not leak onto the cover),
 * whiteboards and study sets (their texture already says what they are), or empty notebooks.
 */
export function CoverPreview({ nb }: { nb: Notebook }) {
  const firstId = nb.locked || (nb.kind && nb.kind !== "notebook") ? undefined : nb.pageIds[0];
  const page = useLive<Page | undefined>(
    () => (firstId ? db.pages.get(firstId) : Promise.resolve(undefined)),
    [firstId],
    undefined,
  );
  if (!page) return null;
  return (
    <span className={`nb-sheet nb-sheet-${nb.paper}`} aria-hidden>
      <SheetBody page={page} paper={nb.paper} />
    </span>
  );
}

function SheetBody({ page, paper }: { page: Page; paper: Notebook["paper"] }) {
  const snapshot = useBlobUrl(page.kind === "html" ? page.snapshotBlobId : undefined);
  if (page.kind === "ink") {
    return (
      <PageThumbCanvas pageId={page.id} version={page.updatedAt} paper={paper} layers={page.layers}
        logicalW={page.size?.w ?? PAGE_SIZE.w} logicalH={page.size?.h ?? PAGE_SIZE.h}
        backgroundBlobId={page.background?.blobId} />
    );
  }
  if (page.kind === "html") {
    return snapshot
      ? <img className="nb-sheet-img" src={snapshot} alt="" draggable={false} />
      : <span className="nb-sheet-text nb-sheet-title">{page.title}</span>;
  }
  const heading = headingsOf(page.doc)[0]?.text;
  const body = textOf(page.doc).slice(0, 220);
  if (!heading && !body) return null;
  return (
    <span className="nb-sheet-text">
      {heading && <span className="nb-sheet-title">{heading}</span>}
      {body && body !== heading && <span>{body}</span>}
    </span>
  );
}
