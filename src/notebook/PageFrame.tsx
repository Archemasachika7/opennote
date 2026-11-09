import type { Notebook, Page } from "../store/schema";
import { PAGE_SIZE } from "../store/schema";
import { InkPage } from "../ink/InkPage";
import { TextPage } from "../text/TextPage";
import { LivePage } from "../live/LivePage";

/** Renders a page body by kind. Text/Live renderers are plugged in by later tasks. */
export function PageFrame({ page, notebook, mounted, width, priority = 0, onEditLive }: {
  page: Page; notebook: Notebook; mounted: boolean; width: number; priority?: number; onEditLive?: (p: Page) => void;
}) {
  const scale = width / PAGE_SIZE.w;
  const height = (page.kind === "html" ? page.height : PAGE_SIZE.h) * scale;
  const paperClass = `paper paper-${notebook.paper} tpl-${page.kind === "ink" ? page.template : "blank"}`;
  return (
    <div className={paperClass} style={{ width, height, ["--s" as string]: scale }} data-kind={page.kind}>
      {page.kind === "html" && <LivePage page={page} mounted={mounted} width={width} priority={priority} onEdit={() => onEditLive?.(page)} />}
      {mounted && page.kind === "text" && <TextPage page={page} width={width} />}
      {mounted && page.kind === "ink" && <InkPage pageId={page.id} width={width} height={height} paper={notebook.paper} />}
    </div>
  );
}
