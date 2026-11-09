import type { Notebook, Page } from "../store/schema";
import { PAGE_SIZE } from "../store/schema";
import { InkLayer } from "../ink/InkLayer";

/** Renders a page body by kind. Text/Live renderers are plugged in by later tasks. */
export function PageFrame({ page, notebook, mounted, width }: { page: Page; notebook: Notebook; mounted: boolean; width: number }) {
  const scale = width / PAGE_SIZE.w;
  const height = (page.kind === "html" ? page.height : PAGE_SIZE.h) * scale;
  const paperClass = `paper paper-${notebook.paper} tpl-${page.kind === "ink" ? page.template : "blank"}`;
  return (
    <div className={paperClass} style={{ width, height, ["--s" as string]: scale }} data-kind={page.kind}>
      {mounted && page.kind === "ink" && <InkLayer pageId={page.id} width={width} height={height} paper={notebook.paper} />}
    </div>
  );
}
