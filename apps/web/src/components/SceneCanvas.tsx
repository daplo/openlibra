import { createTiledScenePainter } from "../editor/scene-tiles";
import { useEffect, useRef, useState, type RefObject } from "react";
import type { OpenLibraRenderer } from "../renderer";
import type { MediaAsset, NodeSummary } from "../editor/types";
import {
  loadSceneFonts,
  loadSceneImages,
  createScenePainter,
  type SceneResources,
} from "../editor/scene-painter";

export function SceneCanvas({
  rendererRef,
  nodes,
  assets,
  editingTextId,
  gpuBenchmark,
  revision,
}: {
  rendererRef: RefObject<OpenLibraRenderer | undefined>;
  nodes: NodeSummary[];
  assets: MediaAsset[];
  editingTextId?: string;
  gpuBenchmark: boolean;
  revision: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const resources = useRef<SceneResources>(new Map());
  const loadedFonts = useRef<string | undefined>(undefined);
  const [resourceError, setResourceError] = useState(false);
  const [paintError, setPaintError] = useState("");
  useEffect(() => {
    let cancelled = false;
    let discoveryFrame = 0;
    let unsubscribe: (() => void) | undefined;
    const paint = gpuBenchmark ? undefined : createScenePainter(nodes, assets);
    const drawContent =
      paint && nodes.length >= 2000 ? createTiledScenePainter(paint) : paint;
    let images = resources.current;
    let dirty = true;
    let previousView = "";
    const draw = () => {
      const canvas = canvasRef.current;
      const renderer = rendererRef.current;
      if (!canvas || !renderer || cancelled) return;
      renderer.setSceneRenderingEnabled(gpuBenchmark);
      const { pan, zoom } = renderer.getViewState();
      const ratio = window.devicePixelRatio || 1;
      const width = Math.round(canvas.clientWidth * ratio);
      const height = Math.round(canvas.clientHeight * ratio);
      const view = JSON.stringify([pan, zoom, ratio, width, height]);
      if (!dirty && view === previousView) return;
      previousView = view;
      dirty = false;
      if (canvas.width !== width) canvas.width = width;
      if (canvas.height !== height) canvas.height = height;
      const context = canvas.getContext("2d");
      if (!context) return;
      context.resetTransform();
      context.clearRect(0, 0, width, height);
      if (gpuBenchmark) return;
      context.setTransform(
        ratio * zoom,
        0,
        0,
        ratio * zoom,
        ratio * pan.x,
        ratio * pan.y,
      );
      const started = performance.now();
      let stats;
      try {
        stats = drawContent!(context, images, { editingTextId });
      } catch (cause) {
        setPaintError(
          cause instanceof Error
            ? cause.message
            : "Could not render this scene.",
        );
        return;
      }
      setPaintError("");
      renderer.setContentStats(nodes.length, stats.visible, paint!.bounds);
      canvas.dataset.paintMs = String(performance.now() - started);
      canvas.dataset.paintCount = String(
        Number(canvas.dataset.paintCount ?? 0) + 1,
      );
      canvas.dataset.paintStats = JSON.stringify(stats);
      canvas.dataset.view = JSON.stringify({ pan, zoom, ratio });
    };
    const connect = () => {
      if (cancelled) return;
      if (rendererRef.current) {
        unsubscribe = rendererRef.current.onFrame(draw);
        draw();
      } else discoveryFrame = requestAnimationFrame(connect);
    };
    connect();
    if (!gpuBenchmark) {
      const fontKey = [
        ...new Set(
          nodes.flatMap((node) =>
            node.text
              ? [
                  `${node.text.font_family}:${node.text.font_weight}:${node.text.font_style}:${node.text.font_size}`,
                ]
              : [],
          ),
        ),
      ]
        .sort()
        .join("|");
      const fontsChanged = loadedFonts.current !== fontKey;
      if (canvasRef.current) canvasRef.current.dataset.resources = "loading";
      void Promise.all([
        loadSceneImages(nodes, assets),
        fontsChanged ? loadSceneFonts(nodes) : Promise.resolve(),
      ])
        .then(([loaded]) => {
          if (cancelled) return;
          const imagesChanged =
            loaded.size !== resources.current.size ||
            [...loaded].some(
              ([key, value]) => resources.current.get(key) !== value,
            );
          if (imagesChanged || fontsChanged) {
            images = loaded;
            resources.current = loaded;
            loadedFonts.current = fontKey;
            dirty = true;
            draw();
          }
          setResourceError(false);
          if (canvasRef.current) canvasRef.current.dataset.resources = "ready";
        })
        .catch(() => {
          if (!cancelled) setResourceError(true);
          if (!cancelled && canvasRef.current)
            canvasRef.current.dataset.resources = "error";
        });
    }
    return () => {
      cancelled = true;
      cancelAnimationFrame(discoveryFrame);
      unsubscribe?.();
    };
  }, [rendererRef, nodes, assets, editingTextId, gpuBenchmark, revision]);
  return (
    <>
      <canvas ref={canvasRef} className="scene-content" aria-hidden="true" />
      {paintError && !gpuBenchmark && (
        <span className="scene-resource-error" role="alert">
          {paintError}
        </span>
      )}
      {resourceError && !paintError && !gpuBenchmark && (
        <span className="scene-resource-error" role="status">
          Some images could not load. PNG export will report the error.
        </span>
      )}
    </>
  );
}
