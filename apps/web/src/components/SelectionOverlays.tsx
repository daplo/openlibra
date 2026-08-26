import { useEffect, useRef, type RefObject } from "react";
import type { OpenLibraRenderer, ColorTheme } from "../renderer";
import type { NodeSummary } from "../editor/types";

export function SelectionOverlay({
  rendererRef,
  selected,
}: {
  rendererRef: RefObject<OpenLibraRenderer | undefined>;
  selected: NodeSummary[];
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let frame = 0;
    const draw = () => {
      const canvas = canvasRef.current;
      const renderer = rendererRef.current;
      if (canvas && renderer) {
        const liveNodes = renderer.getSelectionNodes();
        const liveBounds =
          selected.length === 1 ? renderer.getSelectionBounds() : undefined;
        const liveById = new Map(liveNodes.map((node) => [node.id, node]));
        const hasCompleteLiveSelection =
          liveNodes.length === selected.length &&
          selected.every((node) => liveById.has(node.id));
        const visibleSelection = hasCompleteLiveSelection
          ? selected.map((node) => ({ ...node, ...liveById.get(node.id) }))
          : liveBounds && selected[0]
            ? [{ ...selected[0], ...liveBounds }]
            : selected;
        const resizing = renderer.isResizingSelection();
        canvas.dataset.resizing = String(resizing);
        canvas.dataset.componentSelection = String(
          visibleSelection.some(
            (node) => node.component_id || node.instance_root_id === node.id,
          ),
        );
        canvas.dataset.dimensions =
          resizing && visibleSelection[0]
            ? `${visibleSelection[0].width}x${visibleSelection[0].height}`
            : "";
        drawSelectionOverlay(
          canvas,
          renderer.getViewState(),
          visibleSelection,
          resizing,
        );
      }
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [rendererRef, selected]);
  return (
    <canvas ref={canvasRef} className="selection-overlay" aria-hidden="true" />
  );
}

export function IsolationOverlay({
  rendererRef,
  root,
  theme,
}: {
  rendererRef: RefObject<OpenLibraRenderer | undefined>;
  root: NodeSummary;
  theme: ColorTheme;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let frame = 0;
    const draw = () => {
      const canvas = canvasRef.current;
      const renderer = rendererRef.current;
      if (canvas && renderer) {
        const width = canvas.clientWidth;
        const height = canvas.clientHeight;
        const ratio = devicePixelRatio;
        if (
          canvas.width !== Math.floor(width * ratio) ||
          canvas.height !== Math.floor(height * ratio)
        ) {
          canvas.width = Math.floor(width * ratio);
          canvas.height = Math.floor(height * ratio);
        }
        const context = canvas.getContext("2d");
        if (context) {
          const view = renderer.getViewState();
          const padding = 10;
          context.setTransform(ratio, 0, 0, ratio, 0, 0);
          context.clearRect(0, 0, width, height);
          context.fillStyle =
            theme === "light"
              ? "rgba(235, 238, 244, 0.9)"
              : "rgba(9, 10, 14, 0.88)";
          context.fillRect(0, 0, width, height);
          context.globalCompositeOperation = "destination-out";
          context.fillRect(
            root.x * view.zoom + view.pan.x - padding,
            root.y * view.zoom + view.pan.y - padding,
            root.width * view.zoom + padding * 2,
            root.height * view.zoom + padding * 2,
          );
          context.globalCompositeOperation = "source-over";
        }
      }
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [rendererRef, root, theme]);
  return (
    <canvas
      ref={canvasRef}
      className="isolation-overlay"
      data-testid="component-isolation-mask"
      aria-hidden="true"
    />
  );
}

function drawSelectionOverlay(
  canvas: HTMLCanvasElement,
  view: { pan: { x: number; y: number }; zoom: number },
  selected: NodeSummary[],
  showDimensions: boolean,
) {
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  const ratio = devicePixelRatio;
  const pixelWidth = Math.max(1, Math.floor(width * ratio));
  const pixelHeight = Math.max(1, Math.floor(height * ratio));
  if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
    canvas.width = pixelWidth;
    canvas.height = pixelHeight;
  }
  const context = canvas.getContext("2d");
  if (!context) return;
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  context.clearRect(0, 0, width, height);
  if (selected.length === 0) return;
  const minX =
    Math.min(...selected.map((node) => node.x)) * view.zoom + view.pan.x;
  const minY =
    Math.min(...selected.map((node) => node.y)) * view.zoom + view.pan.y;
  const maxX =
    Math.max(...selected.map((node) => node.x + node.width)) * view.zoom +
    view.pan.x;
  const maxY =
    Math.max(...selected.map((node) => node.y + node.height)) * view.zoom +
    view.pan.y;
  const angle =
    selected.length === 1 ? (selected[0].rotation * Math.PI) / 180 : 0;
  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;
  const rotate = ([x, y]: number[]) => [
    centerX + (x - centerX) * Math.cos(angle) - (y - centerY) * Math.sin(angle),
    centerY + (x - centerX) * Math.sin(angle) + (y - centerY) * Math.cos(angle),
  ];
  const isComponentSelection = selected.some(
    (node) => node.component_id || node.instance_root_id === node.id,
  );
  context.strokeStyle = isComponentSelection ? "#a970ff" : "#34f2ad";
  context.lineWidth = 2;
  const corners = [
    [minX, minY],
    [maxX, minY],
    [maxX, maxY],
    [minX, maxY],
  ].map(rotate);
  context.beginPath();
  context.moveTo(corners[0][0], corners[0][1]);
  for (const point of corners.slice(1)) context.lineTo(point[0], point[1]);
  context.closePath();
  context.stroke();
  if (showDimensions && selected.length === 1) {
    drawDimensionBadge(
      context,
      corners[2][0],
      corners[2][1],
      selected[0].width,
      selected[0].height,
      width,
      height,
    );
  }
  if (selected.length !== 1 || selected[0].kind === "group") return;
  const size = 8;
  const points = [
    [minX, minY],
    [(minX + maxX) / 2, minY],
    [maxX, minY],
    [maxX, (minY + maxY) / 2],
    [maxX, maxY],
    [(minX + maxX) / 2, maxY],
    [minX, maxY],
    [minX, (minY + maxY) / 2],
  ].map(rotate);
  context.fillStyle = "#ffffff";
  for (const [x, y] of points) {
    context.fillRect(x - size / 2, y - size / 2, size, size);
    context.strokeRect(x - size / 2, y - size / 2, size, size);
  }
}

function drawDimensionBadge(
  context: CanvasRenderingContext2D,
  anchorX: number,
  anchorY: number,
  width: number,
  height: number,
  viewportWidth: number,
  viewportHeight: number,
) {
  const format = (value: number) =>
    Number.isInteger(value) ? String(value) : value.toFixed(1);
  const label = `${format(width)} × ${format(height)}`;
  context.save();
  context.font = "600 11px ui-monospace, SFMono-Regular, Menlo, monospace";
  context.textBaseline = "middle";
  const badgeWidth = Math.ceil(context.measureText(label).width) + 14;
  const badgeHeight = 24;
  const x = Math.max(4, Math.min(viewportWidth - badgeWidth - 4, anchorX + 10));
  const y = Math.max(
    4,
    Math.min(viewportHeight - badgeHeight - 4, anchorY + 10),
  );
  context.fillStyle = "#171b1f";
  context.strokeStyle = "#82e6b8";
  context.lineWidth = 1;
  context.beginPath();
  context.roundRect(x, y, badgeWidth, badgeHeight, 5);
  context.fill();
  context.stroke();
  context.fillStyle = "#e8fff4";
  context.fillText(label, x + 7, y + badgeHeight / 2);
  context.restore();
}
