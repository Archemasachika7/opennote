import { useEffect, useRef } from "react";
import type { Notebook, Page } from "../store/schema";
import { PAGE_SIZE } from "../store/schema";
import { InkPage } from "../ink/InkPage";
import { TextPage } from "../text/TextPage";
import { LivePage, LIVE_BAR } from "../live/LivePage";
import { Annotatable } from "../ink/Annotatable";
import { useBlobUrl } from "../ui/useBlobUrl";
import { drawPaperTemplate, isBasicTemplate, usePageTemplate, type StemTemplate } from "../store/templates";
import type { Box } from "../ink/geometry";
import type { Stroke } from "../ink/model";

function StemTemplateBackdrop({
  tpl, width, height, logicalW, logicalH, paper,
}: {
  tpl: StemTemplate;
  width: number;
  height: number;
  logicalW: number;
  logicalH: number;
  paper: Notebook["paper"];
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const dpr = window.devicePixelRatio || 1;
    c.width = Math.max(1, Math.round(width * dpr));
    c.height = Math.max(1, Math.round(height * dpr));
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.setTransform((width * dpr) / logicalW, 0, 0, (height * dpr) / logicalH, 0, 0);
    ctx.clearRect(0, 0, logicalW, logicalH);
    drawPaperTemplate(ctx, tpl, logicalW, logicalH, paper);
  }, [tpl, width, height, logicalW, logicalH, paper]);

  return (
    <canvas
      ref={ref}
      data-testid="stem-template-canvas"
      data-template={tpl}
      style={{ position: "absolute", inset: 0, width, height, pointerEvents: "none" }}
    />
  );
}

/** Renders a page body by kind. */
export function PageFrame({ page, notebook, mounted, width, priority = 0, onEditLive, onMakeCardFromBox }: {
  page: Page; notebook: Notebook; mounted: boolean; width: number; priority?: number; onEditLive?: (p: Page) => void;
  onMakeCardFromBox?: (page: Page, box: Box, strokes: Stroke[]) => void;
}) {
  const scale = width / PAGE_SIZE.w;
  const logicalH = page.kind === "html" ? page.height : page.kind === "ink" ? page.size?.h ?? PAGE_SIZE.h : PAGE_SIZE.h;
  const height = logicalH * scale;
  const bg = useBlobUrl(page.kind === "ink" ? page.background?.blobId : undefined);
  const effTpl = usePageTemplate(page);
  const cssTpl = page.kind === "ink" && isBasicTemplate(effTpl) ? effTpl : "blank";
  const paperClass = `paper paper-${notebook.paper} tpl-${cssTpl}`;
  return (
    <div className={paperClass} style={{ width, height, ["--s" as string]: scale }} data-kind={page.kind}>
      {mounted && page.kind === "ink" && !isBasicTemplate(effTpl) && (
        <StemTemplateBackdrop tpl={effTpl} width={width} height={height} logicalW={PAGE_SIZE.w} logicalH={logicalH} paper={notebook.paper} />
      )}
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
        const style = turned ? { width: height, height: width, left: (width - height) / 2, top: (height - width) / 2, transform: `rotate(${rot}deg)` }
          : rot ? { transform: `rotate(${rot}deg)` } : undefined;
        return <img className="pdf-bg" src={bg} alt="" draggable={false} data-testid="pdf-background" style={style} />;
      })()}
      {mounted && page.kind === "ink" && (
        <InkPage
          pageId={page.id}
          width={width}
          height={height}
          paper={notebook.paper}
          layers={page.layers}
          onMakeCardFromBox={onMakeCardFromBox ? (box, strokes) => onMakeCardFromBox(page, box, strokes) : undefined}
        />
      )}
    </div>
  );
}
