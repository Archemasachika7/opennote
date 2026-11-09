import type { Notebook, Page } from "../store/schema";
import { PAGE_SIZE } from "../store/schema";
import { InkPage } from "../ink/InkPage";
import { TextPage } from "../text/TextPage";
import { LivePage, LIVE_BAR } from "../live/LivePage";
import { Annotatable } from "../ink/Annotatable";

/** Renders a page body by kind. Text/Live renderers are plugged in by later tasks. */
export function PageFrame({ page, notebook, mounted, width, priority = 0, onEditLive }: {
  page: Page; notebook: Notebook; mounted: boolean; width: number; priority?: number; onEditLive?: (p: Page) => void;
}) {
  const scale = width / PAGE_SIZE.w;
  const height = (page.kind === "html" ? page.height : PAGE_SIZE.h) * scale;
  const paperClass = `paper paper-${notebook.paper} tpl-${page.kind === "ink" ? page.template : "blank"}`;
  return (
    <div className={paperClass} style={{ width, height, ["--s" as string]: scale }} data-kind={page.kind}>
      {page.kind === "html" && (
        <Annotatable pageId={page.id} width={width} height={height} paper={notebook.paper} top={LIVE_BAR} inkEnabled={mounted}>
          <LivePage page={page} mounted={mounted} width={width} priority={priority} onEdit={() => onEditLive?.(page)} />
        </Annotatable>
      )}
      {mounted && page.kind === "text" && (
        <Annotatable pageId={page.id} width={width} height={height} paper={notebook.paper}>
          <TextPage page={page} width={width} />
        </Annotatable>
      )}
      {mounted && page.kind === "ink" && <InkPage pageId={page.id} width={width} height={height} paper={notebook.paper} />}
    </div>
  );
}
