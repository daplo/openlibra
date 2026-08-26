import type {
  Dispatch,
  DragEvent as ReactDragEvent,
  SetStateAction,
} from "react";
import { figmaFileToImport } from "./figma-import";
import { preferredArtboardId } from "./model-utils";
import {
  isNodeWithinRoot,
  measureTextBounds,
  readFileAsDataUrl,
  readImageDimensions,
  topLevelFrameAtPoint,
} from "./app-utils";
import type {
  DocumentReadModel,
  NodeSummary,
  TextStyleAsset,
  TypographyStyle,
} from "./types";
import { useEditorInfrastructure } from "./EditorContext";

export function useAssetCommands({
  documentModel,
  selectedNodes,
  refreshDocument,
  setError,
  setIsolationRootId,
  setSelectedNodeIds,
}: {
  documentModel: DocumentReadModel;
  selectedNodes: NodeSummary[];
  refreshDocument: (selection?: string[]) => void;
  setError: (error?: string) => void;
  setIsolationRootId: Dispatch<SetStateAction<string | undefined>>;
  setSelectedNodeIds: Dispatch<SetStateAction<string[]>>;
}) {
  const {
    engineRef,
    rendererRef,
    selectedNodeIdsRef,
    nodesByIdRef,
    isolationRootIdRef,
  } = useEditorInfrastructure();
  function addDocumentColor(color: string) {
    const engine = engineRef.current;
    if (!engine) return;
    try {
      engine.add_document_color(color, color);
      refreshDocument();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }

  function addNumberVariable(name: string, value: number) {
    if (engineRef.current?.add_number_variable(name, value)) refreshDocument();
  }

  async function importImage(
    file: File,
    dropClientPoint?: { x: number; y: number },
  ) {
    const engine = engineRef.current;
    if (!engine) return;
    if (!file.type.match(/^image\/(png|jpeg|webp)$/)) {
      setError("Choose a PNG, JPEG, or WebP image.");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setError("Images must be 10 MB or smaller.");
      return;
    }
    try {
      const source = await readFileAsDataUrl(file);
      const dimensions = await readImageDimensions(source);
      const renderer = rendererRef.current;
      const world =
        dropClientPoint && renderer
          ? renderer.worldPointFromClient(dropClientPoint.x, dropClientPoint.y)
          : undefined;
      const dropParent = world
        ? topLevelFrameAtPoint(documentModel.nodes, world.x, world.y)
        : undefined;
      const parentId =
        dropParent?.id ??
        preferredArtboardId(documentModel.nodes, selectedNodeIdsRef.current);
      const id = engine.add_media_asset_node(
        "image",
        file.name,
        file.type,
        source,
        dimensions.width,
        dimensions.height,
        parentId ?? "",
      );
      if (!id) throw new Error("The image could not be added.");
      if (world) {
        const nodeJson = engine.node_json(id);
        if (nodeJson) {
          const node = JSON.parse(nodeJson) as NodeSummary;
          engine.set_node_bounds(
            id,
            Math.round(world.x - node.width / 2),
            Math.round(world.y - node.height / 2),
            node.width,
            node.height,
          );
        }
      }
      setError(undefined);
      refreshDocument([id]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }

  async function importFigma(file: File) {
    const engine = engineRef.current;
    if (!engine) return;
    if (file.size > 250 * 1024 * 1024) {
      setError("Figma files must be 250 MB or smaller.");
      return;
    }
    try {
      setError(undefined);
      const payload = await figmaFileToImport(file);
      const pageId = engine.import_figma_json(JSON.stringify(payload));
      setIsolationRootId(undefined);
      setSelectedNodeIds([]);
      selectedNodeIdsRef.current = [];
      refreshDocument([]);
      if (pageId) engine.set_active_page(pageId);
      refreshDocument([]);
    } catch (cause) {
      setError(
        `Could not import ${file.name}: ${cause instanceof Error ? cause.message : String(cause)}`,
      );
    }
  }

  function addLibraryIcon(name: string, svg: string) {
    const engine = engineRef.current;
    if (!engine) return;
    const parentId = assetInsertionParentId();
    const id = engine.add_media_asset_node(
      "icon",
      name,
      "image/svg+xml",
      svg,
      24,
      24,
      parentId ?? "",
    );
    if (id) refreshDocument([id]);
  }

  function addNodeFromAsset(assetId: string) {
    const engine = engineRef.current;
    if (!engine) return;
    const parentId = assetInsertionParentId();
    const id = engine.add_node_from_asset(assetId, parentId ?? "");
    if (id) refreshDocument([id]);
  }

  function assetInsertionParentId() {
    const isolationId = isolationRootIdRef.current;
    if (isolationId) {
      const selectedContainer = selectedNodeIdsRef.current
        .map((id) => nodesByIdRef.current.get(id))
        .find(
          (node) =>
            node &&
            (node.kind === "frame" || node.kind === "group") &&
            isNodeWithinRoot(node.id, isolationId, nodesByIdRef.current),
        );
      return selectedContainer?.id ?? isolationId;
    }
    return preferredArtboardId(documentModel.nodes, selectedNodeIdsRef.current);
  }

  async function dropAssetOnCanvas(event: ReactDragEvent<HTMLCanvasElement>) {
    const file = Array.from(event.dataTransfer.files).find((item) =>
      item.type.match(/^image\/(png|jpeg|webp)$/),
    );
    if (file) {
      event.preventDefault();
      await importImage(file, { x: event.clientX, y: event.clientY });
      return;
    }
    const payload = event.dataTransfer.getData(
      "application/x-open-libra-asset",
    );
    const engine = engineRef.current;
    const renderer = rendererRef.current;
    if (!payload || !engine || !renderer) return;
    event.preventDefault();
    try {
      const item = JSON.parse(payload) as
        | { kind: "asset"; assetId: string }
        | { kind: "icon"; name: string; svg: string };
      const world = renderer.worldPointFromClient(event.clientX, event.clientY);
      const parent = topLevelFrameAtPoint(
        documentModel.nodes,
        world.x,
        world.y,
      );
      const id =
        item.kind === "asset"
          ? engine.add_node_from_asset(item.assetId, parent?.id ?? "")
          : engine.add_media_asset_node(
              "icon",
              item.name,
              "image/svg+xml",
              item.svg,
              24,
              24,
              parent?.id ?? "",
            );
      if (!id) return;
      const nodeJson = engine.node_json(id);
      if (nodeJson) {
        const node = JSON.parse(nodeJson) as NodeSummary;
        engine.set_node_bounds(
          id,
          Math.round(world.x - node.width / 2),
          Math.round(world.y - node.height / 2),
          node.width,
          node.height,
        );
      }
      refreshDocument([id]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }

  function updateNodeImageFit(
    node: NodeSummary,
    fit: NodeSummary["image_fit"],
  ) {
    if (engineRef.current?.set_node_image_fit(node.id, fit))
      refreshDocument([node.id]);
  }

  function updateNodeAsset(node: NodeSummary, assetId: string) {
    if (engineRef.current?.set_node_asset(node.id, assetId))
      refreshDocument([node.id]);
  }

  function updateNumberVariable(id: string, name: string, value: number) {
    if (engineRef.current?.update_number_variable(id, name, value))
      refreshDocument();
  }

  function deleteNumberVariable(id: string) {
    if (engineRef.current?.delete_number_variable(id)) refreshDocument();
  }

  function selectedTypography(): TypographyStyle | undefined {
    const text = selectedNodes.find((node) => node.text)?.text;
    if (!text) return undefined;
    return {
      font_family: text.font_family,
      font_weight: text.font_weight,
      font_size: text.font_size,
      line_height: text.line_height,
      letter_spacing: text.letter_spacing,
      horizontal_align: text.horizontal_align,
      vertical_align: text.vertical_align,
      font_style: text.font_style,
      sizing: text.sizing,
    };
  }

  function addTextStyle(name: string) {
    const style = selectedTypography();
    if (!style) return;
    try {
      if (engineRef.current?.add_text_style(name, JSON.stringify(style)))
        refreshDocument();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }

  function updateTextStyle(
    asset: TextStyleAsset,
    name: string,
    styleOverride?: TypographyStyle,
  ) {
    const engine = engineRef.current;
    if (!engine) return;
    const style = styleOverride ?? selectedTypography() ?? asset.style;
    try {
      engine.begin_transaction();
      const changed = engine.update_text_style(
        asset.id,
        name,
        JSON.stringify(style),
      );
      if (changed) {
        const model = JSON.parse(engine.read_model_json()) as DocumentReadModel;
        for (const node of model.nodes) {
          if (node.text_style_id !== asset.id || !node.text) continue;
          const bounds = measureTextBounds(node, node.text);
          if (bounds)
            engine.set_node_bounds(
              node.id,
              node.x,
              node.y,
              node.variable_bindings.width ? node.width : bounds.width,
              node.variable_bindings.height ? node.height : bounds.height,
            );
        }
      }
      engine.end_transaction();
      if (changed) refreshDocument();
    } catch (cause) {
      engine.end_transaction();
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }

  function deleteTextStyle(id: string) {
    if (engineRef.current?.delete_text_style(id)) refreshDocument();
  }

  function bindNodeVariable(
    node: NodeSummary,
    property: string,
    variableId?: string,
  ) {
    if (
      engineRef.current?.bind_node_variable(node.id, property, variableId ?? "")
    )
      refreshDocument([node.id]);
  }

  function createAndBindVariable(
    node: NodeSummary,
    property: string,
    value: number,
  ) {
    const engine = engineRef.current;
    if (!engine) return;
    const label = property
      .split("_")
      .map((part) => part[0]?.toUpperCase() + part.slice(1))
      .join(" ");
    engine.begin_transaction();
    const variableId = engine.add_number_variable(`${label} / ${value}`, value);
    const changed =
      Boolean(variableId) &&
      engine.bind_node_variable(node.id, property, variableId);
    engine.end_transaction();
    if (changed) refreshDocument([node.id]);
  }

  function bindNodeTextStyle(node: NodeSummary, styleId?: string) {
    const engine = engineRef.current;
    if (!engine) return;
    engine.begin_transaction();
    const changed = engine.bind_node_text_style(node.id, styleId ?? "");
    if (changed) {
      const json = engine.node_json(node.id);
      const updated = json ? (JSON.parse(json) as NodeSummary) : undefined;
      if (updated?.text) {
        const bounds = measureTextBounds(updated, updated.text);
        if (bounds)
          engine.set_node_bounds(
            updated.id,
            updated.x,
            updated.y,
            updated.variable_bindings.width ? updated.width : bounds.width,
            updated.variable_bindings.height ? updated.height : bounds.height,
          );
      }
    }
    engine.end_transaction();
    if (changed) refreshDocument([node.id]);
  }

  function createAndBindTextStyle(node: NodeSummary) {
    const engine = engineRef.current;
    if (!engine || !node.text) return;
    const style: TypographyStyle = {
      font_family: node.text.font_family,
      font_weight: node.text.font_weight,
      font_size: node.text.font_size,
      line_height: node.text.line_height,
      letter_spacing: node.text.letter_spacing,
      horizontal_align: node.text.horizontal_align,
      vertical_align: node.text.vertical_align,
      font_style: node.text.font_style,
      sizing: node.text.sizing,
    };
    try {
      engine.begin_transaction();
      const styleId = engine.add_text_style(
        `${node.name} style`,
        JSON.stringify(style),
      );
      const changed =
        Boolean(styleId) && engine.bind_node_text_style(node.id, styleId);
      engine.end_transaction();
      if (changed) refreshDocument([node.id]);
    } catch (cause) {
      engine.end_transaction();
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }

  return {
    addDocumentColor,
    addNumberVariable,
    importImage,
    importFigma,
    addLibraryIcon,
    addNodeFromAsset,
    dropAssetOnCanvas,
    updateNodeImageFit,
    updateNodeAsset,
    updateNumberVariable,
    deleteNumberVariable,
    addTextStyle,
    updateTextStyle,
    deleteTextStyle,
    bindNodeVariable,
    createAndBindVariable,
    bindNodeTextStyle,
    createAndBindTextStyle,
  };
}
