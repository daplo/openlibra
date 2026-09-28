import { useEffect, useRef, type RefObject } from "react";
import type { CollaborationClient } from "../editor/collaboration";
import type { NodeSummary } from "../editor/types";
import type { OpenLibraRenderer } from "../renderer";

export function SharedPresence({
  client,
  pageId,
  nodes,
  rendererRef,
}: {
  client: CollaborationClient;
  pageId: string;
  nodes: NodeSummary[];
  rendererRef: RefObject<OpenLibraRenderer | undefined>;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let frame = 0;
    const draw = () => {
      const canvas = ref.current,
        renderer = rendererRef.current;
      const ctx = canvas?.getContext("2d");
      if (canvas && ctx && renderer) {
        const ratio = devicePixelRatio;
        if (
          canvas.width !== Math.floor(canvas.clientWidth * ratio) ||
          canvas.height !== Math.floor(canvas.clientHeight * ratio)
        ) {
          canvas.width = Math.floor(canvas.clientWidth * ratio);
          canvas.height = Math.floor(canvas.clientHeight * ratio);
        }
        ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
        ctx.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);
        const { pan, zoom } = renderer.getViewState();
        for (const presence of client.presence) {
          if (
            presence.actor_id === client.session.actor ||
            presence.page_id !== pageId
          )
            continue;
          const person = client.participants.find(
            (p) => p.actor_id === presence.actor_id,
          );
          ctx.fillStyle = ctx.strokeStyle = person?.color ?? "#82e6b8";
          ctx.lineWidth = 2;
          for (const id of presence.selection) {
            const node = nodes.find((n) => n.id === id);
            if (node)
              ctx.strokeRect(
                node.x * zoom + pan.x,
                node.y * zoom + pan.y,
                node.width * zoom,
                node.height * zoom,
              );
          }
          if (presence.cursor) {
            const x = presence.cursor.x * zoom + pan.x,
              y = presence.cursor.y * zoom + pan.y;
            ctx.beginPath();
            ctx.moveTo(x, y);
            ctx.lineTo(x + 10, y + 16);
            ctx.lineTo(x, y + 12);
            ctx.closePath();
            ctx.fill();
            ctx.font = "12px sans-serif";
            ctx.fillText(person?.name ?? "Designer", x + 12, y + 20);
          }
        }
      }
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [client, pageId, nodes, rendererRef]);
  return <canvas ref={ref} className="shared-presence" aria-hidden="true" />;
}
