import type { Dispatch, SetStateAction } from "react";
import { hexToRgb, rgbaToHex } from "./model-utils";
import {
  measureTextBounds,
  textStylesEqual,
  textTypographyEqual,
} from "./app-utils";
import type {
  DocumentReadModel,
  NodeSummary,
  ShadowSummary,
  TextStyleSummary,
} from "./types";
import { useEditorInfrastructure } from "./EditorContext";

export function useStyleCommands({
  refreshDocument,
  setDocumentModel,
  setHistoryState,
  setError,
}: {
  refreshDocument: (selection?: string[]) => void;
  setDocumentModel: Dispatch<SetStateAction<DocumentReadModel>>;
  setHistoryState: Dispatch<
    SetStateAction<{ canUndo: boolean; canRedo: boolean }>
  >;
  setError: Dispatch<SetStateAction<string | undefined>>;
}) {
  const { engineRef, rendererRef } = useEditorInfrastructure();
  function updateNodeStyle(
    node: NodeSummary,
    change: Partial<{
      fill: string;
      stroke: string;
      strokeWidth: number;
      cornerRadii: number[];
      strokeAlign: NodeSummary["stroke_align"];
      strokeJoin: NodeSummary["stroke_join"];
    }>,
  ) {
    const engine = engineRef.current;
    if (!engine) return;
    try {
      const radii = change.cornerRadii ?? node.corner_radii;
      const changed = engine.set_node_style(
        node.id,
        change.fill ?? rgbaToHex(node.fill),
        change.stroke ?? rgbaToHex(node.stroke),
        change.strokeWidth ?? node.stroke_width,
        radii[0],
        radii[1],
        radii[2],
        radii[3],
        change.strokeAlign ?? node.stroke_align,
        change.strokeJoin ?? node.stroke_join,
      );
      if (!changed) return;
      const updated: NodeSummary = {
        ...node,
        fill: change.fill
          ? [...hexToRgb(change.fill), node.fill[3]]
          : node.fill,
        stroke: change.stroke
          ? [...hexToRgb(change.stroke), node.stroke[3]]
          : node.stroke,
        stroke_width: change.strokeWidth ?? node.stroke_width,
        corner_radii: change.cornerRadii ?? node.corner_radii,
        stroke_align: change.strokeAlign ?? node.stroke_align,
        stroke_join: change.strokeJoin ?? node.stroke_join,
      };
      setDocumentModel((current) => ({
        ...current,
        nodes: current.nodes.map((candidate) =>
          candidate.id === updated.id ? updated : candidate,
        ),
      }));
      setHistoryState({
        canUndo: engine.can_undo(),
        canRedo: engine.can_redo(),
      });
      rendererRef.current?.setSelectionBounds(updated);
      const sceneStarted = performance.now();
      const scene = engine.scene_data();
      rendererRef.current?.setScene(scene, performance.now() - sceneStarted);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }

  function updateNodeBounds(
    node: NodeSummary,
    change: Partial<{ x: number; y: number; width: number; height: number }>,
  ) {
    const engine = engineRef.current;
    if (!engine) return;
    if (
      engine.set_node_bounds(
        node.id,
        change.x ?? node.x,
        change.y ?? node.y,
        change.width ?? node.width,
        change.height ?? node.height,
      )
    )
      refreshDocument();
  }

  function updateNodeOpacity(node: NodeSummary, opacity: number) {
    if (engineRef.current?.set_node_opacity(node.id, opacity))
      refreshDocument();
  }

  function updateNodeShadows(node: NodeSummary, shadows: ShadowSummary[]) {
    try {
      if (engineRef.current?.set_node_shadows(node.id, JSON.stringify(shadows)))
        refreshDocument();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }

  function updateNodeText(node: NodeSummary, text: TextStyleSummary) {
    const engine = engineRef.current;
    if (!engine) return;
    if (node.text && textStylesEqual(node.text, text)) return;
    try {
      const bounds = measureTextBounds(node, text);
      engine.begin_transaction();
      const styleDetached = Boolean(
        node.text_style_id &&
        node.text &&
        !textTypographyEqual(node.text, text) &&
        engine.bind_node_text_style(node.id, ""),
      );
      const textChanged = engine.set_node_text(node.id, JSON.stringify(text));
      const boundsChanged = bounds
        ? engine.set_node_bounds(
            node.id,
            node.x,
            node.y,
            bounds.width,
            bounds.height,
          )
        : false;
      engine.end_transaction();
      if (styleDetached || textChanged || boundsChanged)
        refreshDocument([node.id]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }

  function updateNodeTransform(
    node: NodeSummary,
    change: Partial<Pick<NodeSummary, "rotation" | "flip_x" | "flip_y">>,
  ) {
    if (
      engineRef.current?.set_node_transform(
        node.id,
        change.rotation ?? node.rotation,
        change.flip_x ?? node.flip_x,
        change.flip_y ?? node.flip_y,
      )
    )
      refreshDocument();
  }

  function updateNodeLayout(
    node: NodeSummary,
    change: Partial<
      Pick<
        NodeSummary,
        | "layout_mode"
        | "layout_align"
        | "layout_justify"
        | "layout_gap"
        | "layout_padding"
        | "auto_height"
      >
    >,
  ) {
    const padding = change.layout_padding ?? node.layout_padding;
    const engine = engineRef.current;
    if (!engine) return;
    let changed = engine.set_node_layout(
      node.id,
      change.layout_mode ?? node.layout_mode,
      change.layout_align ?? node.layout_align,
      change.layout_justify ?? node.layout_justify,
      change.layout_gap ?? node.layout_gap,
      padding[0],
      padding[1],
      padding[2],
      padding[3],
    );
    if (change.auto_height !== undefined)
      changed =
        engine.set_node_auto_height(node.id, change.auto_height) || changed;
    if (changed) refreshDocument();
  }

  function updateNodeWidthSizing(
    node: NodeSummary,
    widthSizing: NodeSummary["width_sizing"],
  ) {
    if (engineRef.current?.set_node_width_sizing(node.id, widthSizing))
      refreshDocument();
  }

  function updateArtboardGuide(
    node: NodeSummary,
    change: Partial<
      Pick<
        NodeSummary,
        | "guide_mode"
        | "guide_count"
        | "guide_gap"
        | "guide_color"
        | "guide_opacity"
      >
    >,
  ) {
    try {
      if (
        engineRef.current?.set_artboard_guide(
          node.id,
          change.guide_mode ?? node.guide_mode,
          change.guide_count ?? node.guide_count,
          change.guide_gap ?? node.guide_gap,
          rgbaToHex(change.guide_color ?? node.guide_color),
          change.guide_opacity ?? node.guide_opacity,
        )
      )
        refreshDocument();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }

  return {
    updateNodeStyle,
    updateNodeBounds,
    updateNodeOpacity,
    updateNodeShadows,
    updateNodeText,
    updateNodeTransform,
    updateNodeLayout,
    updateNodeWidthSizing,
    updateArtboardGuide,
  };
}
