import { useState } from "react";
import { PAGE_SIZE, type PageObject, type Paper } from "../store/schema";
import { useLive } from "../store/useLive";
import { useTool } from "../notebook/tool";
import { InkLayer } from "./InkLayer";
import { ObjectLayer } from "./ObjectLayer";
import { addImage, getObjects } from "./objects";
import { resolveColor } from "./render";

/** An ink page body: images/text boxes under the ink, drop-to-insert images. */
export function InkPage({ pageId, width, height, paper, inputFilter }: {
  pageId: string; width: number; height: number; paper: Paper; inputFilter?: (e: PointerEvent) => boolean;
}) {
  const [tool] = useTool();
  const stored = useLive(() => getObjects(pageId), [pageId], [] as PageObject[]);
  const [preview, setPreview] = useState<PageObject[] | null>(null);
  const [cropping, setCropping] = useState<string | null>(null);
  const scale = width / PAGE_SIZE.w;
  const objects = preview ? stored.map((o) => preview.find((p) => p.id === o.id) ?? o) : stored;

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
        cropping={cropping} setCropping={setCropping} />
      <InkLayer pageId={pageId} width={width} height={height} paper={paper} inputFilter={inputFilter}
        objects={stored} onPreviewObjects={setPreview} onCropRequest={setCropping}
        disabled={tool.tool === "text" || tool.tool === "image" || cropping !== null} />
    </div>
  );
}
