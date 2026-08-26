import { useEffect, useRef, type RefObject } from "react";
import type { OpenLibraRenderer, ColorTheme } from "../renderer";

export function CanvasGrid({
  rendererRef,
  theme,
}: {
  rendererRef: RefObject<OpenLibraRenderer | undefined>;
  theme: ColorTheme;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let frame = 0;
    const draw = () => {
      const canvas = canvasRef.current;
      const renderer = rendererRef.current;
      if (canvas && renderer)
        drawCanvasGrid(canvas, renderer.getViewState(), theme);
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [rendererRef, theme]);
  return (
    <canvas
      ref={canvasRef}
      className="canvas-grid"
      data-testid="canvas-grid"
      aria-hidden="true"
    />
  );
}

function drawCanvasGrid(
  canvas: HTMLCanvasElement,
  view: { pan: { x: number; y: number }; zoom: number },
  theme: ColorTheme,
) {
  const width = canvas.clientWidth,
    height = canvas.clientHeight,
    ratio = devicePixelRatio;
  if (
    canvas.width !== Math.floor(width * ratio) ||
    canvas.height !== Math.floor(height * ratio)
  ) {
    canvas.width = Math.floor(width * ratio);
    canvas.height = Math.floor(height * ratio);
  }
  const context = canvas.getContext("2d");
  if (!context) return;
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  context.clearRect(0, 0, width, height);
  let worldStep = 16;
  while (worldStep * view.zoom < 12) worldStep *= 2;
  const spacing = worldStep * view.zoom;
  const startX = ((view.pan.x % spacing) + spacing) % spacing;
  const startY = ((view.pan.y % spacing) + spacing) % spacing;
  const drawLines = (major: boolean) => {
    context.beginPath();
    for (
      let x = startX, index = Math.round((x - view.pan.x) / spacing);
      x <= width;
      x += spacing, index += 1
    ) {
      if ((index % 4 === 0) !== major) continue;
      context.moveTo(Math.round(x) + 0.5, 0);
      context.lineTo(Math.round(x) + 0.5, height);
    }
    for (
      let y = startY, index = Math.round((y - view.pan.y) / spacing);
      y <= height;
      y += spacing, index += 1
    ) {
      if ((index % 4 === 0) !== major) continue;
      context.moveTo(0, Math.round(y) + 0.5);
      context.lineTo(width, Math.round(y) + 0.5);
    }
    context.strokeStyle =
      theme === "light"
        ? major
          ? "#87909f35"
          : "#87909f1c"
        : major
          ? "#d8dde52c"
          : "#d8dde516";
    context.lineWidth = 1;
    context.stroke();
  };
  drawLines(false);
  drawLines(true);
}
