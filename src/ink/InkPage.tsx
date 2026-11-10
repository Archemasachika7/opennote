import { useMemo, useState } from "react";
import { PAGE_SIZE, type PageObject, type Paper } from "../store/schema";
import { useLive } from "../store/useLive";
import { useTool } from "../notebook/tool";
import { InkLayer } from "./InkLayer";
import { ObjectLayer } from "./ObjectLayer";
import { TapeLayer } from "./TapeLayer";
import { addImage, getObjects } from "./objects";
import { resolveColor } from "./render";
import { BASE_LAYER, getActiveLayer, hiddenLayers, lockedLayers, useActiveLayerVersion, type Layer } from "./layers";

import type { Box } from "./geometry";
import type { Stroke } from "./model";

/** An ink page body: images/text boxes under the ink, tape over it, drop-to-insert images. */
export function InkPage({ pageId, width, height, paper, inputFilter, layers, onMakeCardFromBox }: {
  pageId: string; width: number; height: number; paper: Paper; inputFilter?: (e: PointerEvent) => boolean; layers?: Layer[];
  onMakeCardFromBox?: (box: Box, strokes: Stroke[]) => void;
}) {
  const [tool] = useTool();
  useActiveLayerVersion();
  const stored = useLive(() => getObjects(pageId), [pageId], [] as PageObject[]);
  const [preview, setPreview] = useState<PageObject[] | null>(null);
  const [cropping, setCropping] = useState<string | null>(null);
  const scale = width / PAGE_SIZE.w;
  const objects = preview ? stored.map((o) => preview.find((p) => p.id === o.id) ?? o) : stored;
  const hidden = useMemo(() => hiddenLayers({ layers }), [layers]);
  const locked = useMemo(() => lockedLayers({ layers }), [layers]);
  const active = getActiveLayer(pageId, { layers });

  const onDrop = async (e: React.DragEvent) => {
    const files = [...(e.dataTransfer?.files ?? [])].filter((f) => f.type.startsWith("image/"));
    if (files.length === 0) return;
    e.preventDefault();
    const r = e.currentTarget.getBoundingClientRect();
    const at = { x: (e.clientX - r.left) / scale, y: (e.clientY - r.top) / scale };
    for (const [i, f] of files.entries()) await addImage(pageId, f, { x: at.x + i * 24, y: at.y + i * 24 });
  };

  const textColor = resolveColor({ color: tool.color, paletteIndex: tool.paletteIndex ?? undefined }, paper);
  return (
    <div className="ink-page" data-testid="ink-page" onDragOver={(e) => e.preventDefault()} onDrop={onDrop}>
      <ObjectLayer pageId={pageId} objects={objects} scale={scale} tool={tool.tool} textColor={textColor}
        cropping={cropping} setCropping={setCropping} hidden={hidden} locked={locked} layerId={active === BASE_LAYER ? undefined : active} />
      <InkLayer pageId={pageId} width={width} height={height} paper={paper} inputFilter={inputFilter} layers={layers} tapeEnabled
        objects={stored.filter((o) => !hidden.has(o.layerId ?? BASE_LAYER))} onPreviewObjects={setPreview} onCropRequest={setCropping}
        onMakeCardFromBox={onMakeCardFromBox}
        disabled={tool.tool === "text" || tool.tool === "image" || cropping !== null} />
      <TapeLayer objects={objects} scale={scale} tool={tool.tool} hidden={hidden} locked={locked} />
    </div>
  );
}
