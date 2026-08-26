import { useEffect, useRef, type RefObject } from "react";
import type { OpenLibraRenderer, ColorTheme } from "../renderer";

export function Rulers({
  rendererRef,
  theme,
}: {
  rendererRef: RefObject<OpenLibraRenderer | undefined>;
  theme: ColorTheme;
}) {
  const horizontalRef = useRef<HTMLCanvasElement>(null);
  const verticalRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let frame = 0;
    function draw() {
      const renderer = rendererRef.current;
      const horizontal = horizontalRef.current;
      const vertical = verticalRef.current;
      if (renderer && horizontal && vertical)
        drawRulers(horizontal, vertical, renderer.getViewState(), theme);
      frame = requestAnimationFrame(draw);
    }
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [rendererRef, theme]);
  return (
    <div className="rulers" aria-hidden="true">
      <canvas className="horizontal-ruler" ref={horizontalRef} />
      <canvas className="vertical-ruler" ref={verticalRef} />
      <span className="ruler-corner" />
    </div>
  );
}

function drawRulers(
  horizontal: HTMLCanvasElement,
  vertical: HTMLCanvasElement,
  view: { pan: { x: number; y: number }; zoom: number },
  theme: ColorTheme,
) {
  const stage = horizontal.parentElement?.parentElement;
  if (!stage) return;
  const width = stage.clientWidth;
  const height = stage.clientHeight;
  const ratio = devicePixelRatio;
  const setup = (
    canvas: HTMLCanvasElement,
    cssWidth: number,
    cssHeight: number,
  ) => {
    if (
      canvas.width !== cssWidth * ratio ||
      canvas.height !== cssHeight * ratio
    ) {
      canvas.width = cssWidth * ratio;
      canvas.height = cssHeight * ratio;
    }
    const context = canvas.getContext("2d")!;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, cssWidth, cssHeight);
    context.fillStyle = theme === "light" ? "#F7F8FA" : "#17181C";
    context.fillRect(0, 0, cssWidth, cssHeight);
    context.strokeStyle = theme === "light" ? "#A8ADB7" : "#666B75";
    context.fillStyle = theme === "light" ? "#555B66" : "#A8ADB7";
    context.font = "9px ui-monospace, monospace";
    return context;
  };
  const h = setup(horizontal, width - 24, 24);
  const v = setup(vertical, 24, height - 24);
  const steps = [10, 20, 50, 100, 200, 500, 1000];
  const step = steps.find((candidate) => candidate * view.zoom >= 55) ?? 1000;
  const minorStep = step / 5;
  const firstX = Math.floor(-view.pan.x / view.zoom / step) * step;
  const firstY = Math.floor(-view.pan.y / view.zoom / step) * step;
  const firstMinorX =
    Math.floor(-view.pan.x / view.zoom / minorStep) * minorStep;
  const firstMinorY =
    Math.floor(-view.pan.y / view.zoom / minorStep) * minorStep;
  h.globalAlpha = 0.55;
  for (
    let world = firstMinorX;
    world * view.zoom + view.pan.x < width;
    world += minorStep
  ) {
    const subdivision = Math.round(world / minorStep);
    if (subdivision % 5 === 0) continue;
    const x = world * view.zoom + view.pan.x - 24;
    const tickHeight = subdivision % 5 === 2 || subdivision % 5 === 3 ? 6 : 4;
    h.beginPath();
    h.moveTo(x, 24 - tickHeight);
    h.lineTo(x, 24);
    h.stroke();
  }
  v.globalAlpha = 0.55;
  for (
    let world = firstMinorY;
    world * view.zoom + view.pan.y < height;
    world += minorStep
  ) {
    const subdivision = Math.round(world / minorStep);
    if (subdivision % 5 === 0) continue;
    const y = world * view.zoom + view.pan.y - 24;
    const tickWidth = subdivision % 5 === 2 || subdivision % 5 === 3 ? 6 : 4;
    v.beginPath();
    v.moveTo(24 - tickWidth, y);
    v.lineTo(24, y);
    v.stroke();
  }
  h.globalAlpha = 1;
  v.globalAlpha = 1;
  for (
    let world = firstX;
    world * view.zoom + view.pan.x < width;
    world += step
  ) {
    const x = world * view.zoom + view.pan.x - 24;
    h.beginPath();
    h.moveTo(x, 14);
    h.lineTo(x, 24);
    h.stroke();
    h.fillText(String(world), x + 3, 10);
  }
  for (
    let world = firstY;
    world * view.zoom + view.pan.y < height;
    world += step
  ) {
    const y = world * view.zoom + view.pan.y - 24;
    v.beginPath();
    v.moveTo(14, y);
    v.lineTo(24, y);
    v.stroke();
    v.save();
    v.translate(10, y + 3);
    v.rotate(-Math.PI / 2);
    v.fillText(String(world), 0, 0);
    v.restore();
  }
}
