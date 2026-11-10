import type { Notebook, Page } from "../store/schema";
import { PAGE_SIZE } from "../store/schema";
import { InkPage } from "../ink/InkPage";
import { TextPage } from "../text/TextPage";
import { LivePage, LIVE_BAR } from "../live/LivePage";
import { Annotatable } from "../ink/Annotatable";
import { useBlobUrl } from "../ui/useBlobUrl";


/** Renders a page body by kind. Text/Live renderers are plugged in by later tasks. */
export function PageFrame({ page, notebook, mounted, width, priority = 0, onEditLive }: {
  page: Page; notebook: Notebook; mounted: boolean; width: number; priority?: number; onEditLive?: (p: Page) => void;
}) {
  const scale = width / PAGE_SIZE.w;
  const height = (page.kind === "html" ? page.height : page.kind === "ink" ? page.size?.h ?? PAGE_SIZE.h : PAGE_SIZE.h) * scale;
  const bg = useBlobUrl(page.kind === "ink" ? page.background?.blobId : undefined);
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
      {/* Imported PDF page: an image under the ink, so the eraser can never remove it. */}
      {bg && (() => {
        const rot = page.kind === "ink" ? page.background?.rotation ?? 0 : 0;
        const turned = rot % 180 !== 0;
        // a turned background is sized to the swapped box, then rotated about its centre
        const style = turned ? { width: height, height: width, left: (width - height) / 2, top: (height - width) / 2, transform: `rotate(${rot}deg)` }
          : rot ? { transform: `rotate(${rot}deg)` } : undefined;
        return <img className="pdf-bg" src={bg} alt="" draggable={false} data-testid="pdf-background" style={style} />;
      })()}
      {mounted && page.kind === "ink" && <InkPage pageId={page.id} width={width} height={height} paper={notebook.paper} layers={page.layers} />}
    </div>
  );
}
