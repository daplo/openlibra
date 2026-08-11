import { useEffect, useMemo, useRef, useState } from "react";
import {
  Frame,
  Hand,
  MessageCircle,
  Moon,
  MousePointer2,
  Redo2,
  Square,
  Sun,
  Type,
  Undo2,
} from "lucide-react";
import {
  ArtboardGuides,
  CanvasGrid,
  Rulers,
  SelectionOverlay,
  TextOverlay,
} from "./components/CanvasOverlays";
import { ArtboardMenu } from "./components/ArtboardMenu";
import { Inspect, Review, ToolButton } from "./components/EditorChrome";
import { Panel } from "./components/EditorSidebar";
import { Properties } from "./components/PropertiesPanel";
import { ARTBOARD_PRESETS, EMPTY_STATS, MODES } from "./editor/constants";
import {
  EditorInputController,
  type EditorInputHandlers,
} from "./editor/input";
import {
  collectDocumentColors,
  findSelectedAncestor,
  hexToRgb,
  preferredArtboardId,
  rgbaToHex,
} from "./editor/model-utils";
import type {
  DocumentReadModel,
  Mode,
  NodeSummary,
  ShadowSummary,
  TextStyleSummary,
} from "./editor/types";
import init, { DocumentEngine } from "./wasm/open_libra_scene_wasm";
import {
  OpenLibraRenderer,
  type CanvasTool,
  type ColorTheme,
  type ResizeHandle,
} from "./renderer";

export function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<OpenLibraRenderer | undefined>(undefined);
  const engineRef = useRef<DocumentEngine | undefined>(undefined);
  const selectedNodeIdsRef = useRef<string[]>([]);
  const inputControllerRef = useRef<EditorInputController | undefined>(
    undefined,
  );
  const canvasToolRef = useRef<CanvasTool>("select");
  const themeRef = useRef<ColorTheme>("dark");
  const pendingSceneFrameRef = useRef<number | undefined>(undefined);
  const documentModelRef = useRef<DocumentReadModel | undefined>(undefined);
  const editMenuRef = useRef<HTMLDivElement>(null);
  const viewMenuRef = useRef<HTMLDivElement>(null);
  const [mode, setMode] = useState<Mode>("design");
  const [canvasTool, setCanvasTool] = useState<CanvasTool>("select");
  const [theme, setTheme] = useState<ColorTheme>(() => {
    const saved = localStorage.getItem("open-libra-theme");
    if (saved === "light" || saved === "dark") return saved;
    return matchMedia("(prefers-color-scheme: light)").matches
      ? "light"
      : "dark";
  });
  const [stats, setStats] = useState(EMPTY_STATS);
  const [error, setError] = useState<string>();
  const [editingTextId, setEditingTextId] = useState<string>();
  const [artboardMenuOpen, setArtboardMenuOpen] = useState(false);
  const [documentModel, setDocumentModel] = useState<DocumentReadModel>({
    schema_version: 1,
    active_page_id: "",
    pages: [],
    nodes: [],
    document_colors: [],
  });
  const [, setModelPatchVersion] = useState(0);
  const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>([]);
  const [historyState, setHistoryState] = useState({
    canUndo: false,
    canRedo: false,
  });
  const [editMenuOpen, setEditMenuOpen] = useState(false);
  const [viewMenuOpen, setViewMenuOpen] = useState(false);
  const [rulersVisible, setRulersVisible] = useState(
    () => localStorage.getItem("open-libra-rulers") !== "hidden",
  );
  const [gridVisible, setGridVisible] = useState(
    () => localStorage.getItem("open-libra-grid") === "visible",
  );
  const [toolbarPosition, setToolbarPosition] = useState<"top" | "bottom">(
    () =>
      localStorage.getItem("open-libra-toolbar-position") === "bottom"
        ? "bottom"
        : "top",
  );
  const nodesById = useMemo(
    () => new Map(documentModel.nodes.map((node) => [node.id, node])),
    [documentModel.nodes],
  );
  const selectedNodes = useMemo(
    () =>
      selectedNodeIds
        .map((id) => nodesById.get(id))
        .filter((node): node is NodeSummary => node !== undefined),
    [nodesById, selectedNodeIds],
  );
  const editingTextNode = editingTextId
    ? nodesById.get(editingTextId)
    : undefined;
  const documentColors = useMemo(
    () => collectDocumentColors(documentModel),
    [documentModel],
  );
  const guidedArtboards = useMemo(
    () =>
      documentModel.nodes.filter(
        (node) => node.kind === "frame" && node.guide_mode !== "none",
      ),
    [documentModel.nodes],
  );
  canvasToolRef.current = canvasTool;
  themeRef.current = theme;
  documentModelRef.current = documentModel;

  function refreshDocument(selection = selectedNodeIdsRef.current) {
    const engine = engineRef.current;
    if (!engine) return;
    const model = JSON.parse(engine.read_model_json()) as DocumentReadModel;
    const validSelection = selection.filter((id) =>
      model.nodes.some((node) => node.id === id),
    );
    const currentSelection = selectedNodeIdsRef.current;
    if (
      validSelection.length !== currentSelection.length ||
      validSelection.some((id, index) => id !== currentSelection[index])
    ) {
      selectedNodeIdsRef.current = validSelection;
      setSelectedNodeIds(validSelection);
    }
    setDocumentModel(model);
    setHistoryState({ canUndo: engine.can_undo(), canRedo: engine.can_redo() });
    const selected = model.nodes.filter((node) =>
      validSelection.includes(node.id),
    );
    rendererRef.current?.setSelectionNodes(selected);
    rendererRef.current?.setSelectionBounds(
      selected.length === 1 && selected[0].kind !== "group"
        ? selected[0]
        : undefined,
    );
    const sceneStarted = performance.now();
    const scene = engine.scene_data();
    rendererRef.current?.setScene(scene, performance.now() - sceneStarted);
  }

  function scheduleSceneRefresh() {
    if (pendingSceneFrameRef.current !== undefined) return;
    pendingSceneFrameRef.current = requestAnimationFrame(() => {
      pendingSceneFrameRef.current = undefined;
      const engine = engineRef.current;
      const renderer = rendererRef.current;
      if (!engine || !renderer) return;
      const bounds = renderer.getVisibleWorldBounds();
      const sceneStarted = performance.now();
      const scene = engine.scene_data_for_view(
        bounds.left,
        bounds.top,
        bounds.right,
        bounds.bottom,
      );
      renderer.setVisibleScene(scene, performance.now() - sceneStarted);
    });
  }

  function refreshLiveSelectionBounds() {
    const engine = engineRef.current;
    const selection = selectedNodeIdsRef.current;
    if (!engine || selection.length === 0) return;
    const nodes = selection.flatMap((id) => {
      const json = engine.node_json(id);
      return json ? [JSON.parse(json) as NodeSummary] : [];
    });
    rendererRef.current?.setSelectionNodes(nodes);
    const node = nodes[0];
    rendererRef.current?.setSelectionBounds(
      nodes.length === 1 && node?.kind !== "group" ? node : undefined,
    );
  }

  function patchSelectedNodesFromEngine() {
    const engine = engineRef.current;
    const selection = selectedNodeIdsRef.current;
    if (!engine) return;
    const replacements = new Map<string, NodeSummary>();
    for (const id of selection) {
      const json = engine.node_json(id);
      if (json) replacements.set(id, JSON.parse(json) as NodeSummary);
    }
    if (replacements.size > 0) {
      const model = documentModelRef.current;
      if (model) {
        for (const [id, replacement] of replacements) {
          const current = model.nodes.find((node) => node.id === id);
          if (current) Object.assign(current, replacement);
        }
        setModelPatchVersion((version) => version + 1);
      }
    }
    const selected = selection
      .map((id) => replacements.get(id))
      .filter((node): node is NodeSummary => node !== undefined);
    rendererRef.current?.setSelectionNodes(selected);
    rendererRef.current?.setSelectionBounds(
      selected.length === 1 && selected[0].kind !== "group"
        ? selected[0]
        : undefined,
    );
    setHistoryState({ canUndo: engine.can_undo(), canRedo: engine.can_redo() });
  }

  function flushPendingSceneRefresh() {
    if (pendingSceneFrameRef.current === undefined) return;
    cancelAnimationFrame(pendingSceneFrameRef.current);
    pendingSceneFrameRef.current = undefined;
  }

  function applySelection(ids: string[]) {
    const validSelection = ids.filter((id) => nodesById.has(id));
    selectedNodeIdsRef.current = validSelection;
    setSelectedNodeIds(validSelection);
    const selected = validSelection
      .map((id) => nodesById.get(id))
      .filter((node): node is NodeSummary => node !== undefined);
    rendererRef.current?.setSelectionNodes(selected);
    rendererRef.current?.setSelectionBounds(
      selected.length === 1 && selected[0].kind !== "group"
        ? selected[0]
        : undefined,
    );
  }

  function addNode(kind: "frame" | "rectangle" | "text") {
    const engine = engineRef.current;
    if (!engine) return;
    const parentId = preferredArtboardId(
      documentModel.nodes,
      selectedNodeIdsRef.current,
    );
    const id =
      kind === "frame"
        ? engine.add_frame()
        : kind === "text"
          ? engine.add_text_to(parentId ?? "")
          : engine.add_rectangle_to(parentId ?? "");
    refreshDocument([id]);
    if (kind === "text") setEditingTextId(id);
  }

  function addArtboard(preset: (typeof ARTBOARD_PRESETS)[number]) {
    const engine = engineRef.current;
    if (!engine) return;
    try {
      const id = engine.add_artboard(preset.name, preset.width, preset.height);
      refreshDocument([id]);
      const model = JSON.parse(engine.read_model_json()) as DocumentReadModel;
      const node = model.nodes.find((candidate) => candidate.id === id);
      if (node) rendererRef.current?.centerOnBounds(node);
      setArtboardMenuOpen(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }

  function addPage() {
    const engine = engineRef.current;
    if (!engine) return;
    engine.add_page(`Page ${documentModel.pages.length + 1}`);
    refreshDocument([]);
    rendererRef.current?.resetView();
  }

  function selectPage(id: string) {
    if (!engineRef.current?.set_active_page(id)) return;
    refreshDocument([]);
    rendererRef.current?.resetView();
  }

  function deleteSelected() {
    const engine = engineRef.current;
    if (!engine || selectedNodeIds.length === 0) return;
    let changed = false;
    for (const id of selectedNodeIds)
      changed = engine.delete_node(id) || changed;
    if (!changed) return;
    refreshDocument([]);
  }

  function groupSelected() {
    if (!engineRef.current || selectedNodeIds.length < 2) return;
    try {
      const groupId = engineRef.current.group_nodes(
        JSON.stringify(selectedNodeIds),
      );
      refreshDocument([groupId]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }

  function moveSelection(dx: number, dy: number) {
    const selection = selectedNodeIdsRef.current;
    if (!engineRef.current || selection.length === 0) return;
    if (engineRef.current.move_nodes(JSON.stringify(selection), dx, dy)) {
      refreshLiveSelectionBounds();
      scheduleSceneRefresh();
    }
  }

  function resizeSelection(handle: ResizeHandle, dx: number, dy: number) {
    const selection = selectedNodeIdsRef.current;
    if (!engineRef.current || selection.length !== 1) return;
    const node = documentModel.nodes.find(
      (candidate) => candidate.id === selection[0],
    );
    const angle = (-(node?.rotation ?? 0) * Math.PI) / 180;
    const localDx = dx * Math.cos(angle) - dy * Math.sin(angle);
    const localDy = dx * Math.sin(angle) + dy * Math.cos(angle);
    if (engineRef.current.resize_node(selection[0], handle, localDx, localDy)) {
      refreshLiveSelectionBounds();
      scheduleSceneRefresh();
    }
  }

  function selectNode(id: string, additive: boolean) {
    const current = selectedNodeIdsRef.current;
    if (!additive) applySelection([id]);
    else
      applySelection(
        current.includes(id)
          ? current.filter((selected) => selected !== id)
          : [...current, id],
      );
  }

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
    try {
      const bounds = measureTextBounds(node, text);
      engine.begin_transaction();
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
      if (textChanged || boundsChanged) refreshDocument([node.id]);
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

  function undo() {
    if (engineRef.current?.undo()) refreshDocument();
  }

  function redo() {
    if (engineRef.current?.redo()) refreshDocument();
  }

  function alignSelected(alignment: string) {
    const selection = selectedNodeIdsRef.current;
    if (selection.length < 2) return;
    if (engineRef.current?.align_nodes(JSON.stringify(selection), alignment))
      refreshDocument(selection);
  }

  function selectCanvasPoint(
    clientX: number,
    clientY: number,
    additive: boolean,
  ) {
    if (canvasToolRef.current !== "select") return;
    const renderer = rendererRef.current;
    const engine = engineRef.current;
    if (!renderer || !engine) return;
    const world = renderer.worldPointFromClient(clientX, clientY);
    const hitId = engine.hit_test(world.x, world.y);
    if (!hitId) {
      if (!additive) applySelection([]);
      return;
    }
    const selectedAncestor = findSelectedAncestor(
      hitId,
      selectedNodeIdsRef.current,
      documentModel.nodes,
    );
    selectNode(selectedAncestor ?? hitId, additive);
  }

  function createInputHandlers(): EditorInputHandlers {
    return {
      selectCanvasPoint,
      setMode,
      setTool: setCanvasTool,
      getTool: () => canvasToolRef.current,
      zoomIn: () => rendererRef.current?.zoomBy(1.2),
      zoomOut: () => rendererRef.current?.zoomBy(1 / 1.2),
      resetView: () => rendererRef.current?.resetView(),
      zoomToFit: () => rendererRef.current?.zoomToFit(),
      toggleRulers: () => setRulersVisible((visible) => !visible),
      toggleGrid: () => setGridVisible((visible) => !visible),
      deleteSelection: deleteSelected,
      undo,
      redo,
      nudgeSelection: moveSelection,
      beginTextEdit: (clientX, clientY) => {
        const renderer = rendererRef.current;
        const engine = engineRef.current;
        if (!renderer || !engine) return;
        const world = renderer.worldPointFromClient(clientX, clientY);
        const id = engine.hit_test(world.x, world.y);
        const node = documentModelRef.current?.nodes.find(
          (item) => item.id === id,
        );
        if (node?.kind === "text" && !node.locked) {
          applySelection([node.id]);
          setEditingTextId(node.id);
        }
      },
    };
  }

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let disposed = false;
    let localEngine: DocumentEngine | undefined;
    let localRenderer: OpenLibraRenderer | undefined;
    let localInputController: EditorInputController | undefined;

    async function start() {
      if (!navigator.gpu) {
        throw new Error(
          "Open Libra currently requires WebGPU in a current desktop Chrome or Edge browser.",
        );
      }
      await init();
      if (disposed) return;
      const startedAt = performance.now();
      const engine = new DocumentEngine();
      localEngine = engine;
      engineRef.current = engine;
      setDocumentModel(
        JSON.parse(engine.read_model_json()) as DocumentReadModel,
      );
      const rectData = engine.scene_data();
      const sceneBuildMs = performance.now() - startedAt;

      const renderer = await OpenLibraRenderer.create(
        canvas!,
        rectData,
        sceneBuildMs,
        setStats,
        setError,
      );
      localRenderer = renderer;
      if (disposed) {
        renderer.dispose();
        engine.free();
        localEngine = undefined;
        return;
      }
      rendererRef.current = renderer;
      renderer.setTool(canvasToolRef.current);
      renderer.setTheme(themeRef.current);
      renderer.setInteractionHandlers({
        hitTest: (x, y) => {
          const id = engine.hit_test(x, y);
          return id || undefined;
        },
        select: () => {},
        moveSelection: (dx, dy) => moveSelection(dx, dy),
        resizeSelection: (handle, dx, dy) => resizeSelection(handle, dx, dy),
        beginEdit: () => {
          engine.begin_geometry_transaction(
            JSON.stringify(selectedNodeIdsRef.current),
          );
        },
        endEdit: () => {
          flushPendingSceneRefresh();
          const isBenchmark =
            (documentModelRef.current?.nodes.length ?? 0) >= 1_000;
          if (!isBenchmark) {
            engine.reparent_nodes_to_artboards(
              JSON.stringify(selectedNodeIdsRef.current),
            );
          }
          engine.end_transaction();
          if (isBenchmark) {
            patchSelectedNodesFromEngine();
            scheduleSceneRefresh();
          } else {
            refreshDocument();
          }
        },
      });
      const inputController = new EditorInputController(
        canvas!,
        renderer,
        createInputHandlers(),
      );
      localInputController = inputController;
      inputControllerRef.current = inputController;
      renderer.start();
    }

    start().catch((cause: unknown) =>
      setError(cause instanceof Error ? cause.message : String(cause)),
    );
    return () => {
      disposed = true;
      localInputController?.dispose();
      localRenderer?.dispose();
      localEngine?.free();
      if (rendererRef.current === localRenderer)
        rendererRef.current = undefined;
      if (inputControllerRef.current === localInputController)
        inputControllerRef.current = undefined;
      if (engineRef.current === localEngine) engineRef.current = undefined;
    };
    // Renderer ownership is intentionally tied to the canvas mount lifecycle.
    // Interaction callbacks read mutable engine and selection refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    inputControllerRef.current?.setHandlers(createInputHandlers());
  });

  useEffect(() => {
    if (!editMenuOpen) return;
    function closeEditMenu(event: PointerEvent) {
      if (
        event.target instanceof Node &&
        editMenuRef.current?.contains(event.target)
      )
        return;
      setEditMenuOpen(false);
    }
    document.addEventListener("pointerdown", closeEditMenu, true);
    return () =>
      document.removeEventListener("pointerdown", closeEditMenu, true);
  }, [editMenuOpen]);

  useEffect(() => {
    if (!viewMenuOpen) return;
    function closeViewMenu(event: PointerEvent) {
      if (
        event.target instanceof Node &&
        viewMenuRef.current?.contains(event.target)
      )
        return;
      setViewMenuOpen(false);
    }
    document.addEventListener("pointerdown", closeViewMenu, true);
    return () =>
      document.removeEventListener("pointerdown", closeViewMenu, true);
  }, [viewMenuOpen]);

  useEffect(
    () =>
      localStorage.setItem(
        "open-libra-rulers",
        rulersVisible ? "visible" : "hidden",
      ),
    [rulersVisible],
  );

  useEffect(
    () => localStorage.setItem("open-libra-toolbar-position", toolbarPosition),
    [toolbarPosition],
  );

  useEffect(
    () =>
      localStorage.setItem(
        "open-libra-grid",
        gridVisible ? "visible" : "hidden",
      ),
    [gridVisible],
  );

  useEffect(() => {
    rendererRef.current?.setTool(canvasTool);
  }, [canvasTool]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("open-libra-theme", theme);
    rendererRef.current?.setTheme(theme);
  }, [theme]);

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand">
          <span className="mark">OL</span>
          <strong>Open Libra</strong>
          <span className="file-name">Engine study</span>
          <div className="menu-anchor" ref={editMenuRef}>
            <button
              className={`menu-trigger ${editMenuOpen ? "active" : ""}`}
              onClick={() => {
                setViewMenuOpen(false);
                setEditMenuOpen((open) => !open);
              }}
            >
              Edit
            </button>
            {editMenuOpen && (
              <div className="edit-menu" role="menu">
                <button
                  role="menuitem"
                  disabled={!historyState.canUndo}
                  onClick={() => {
                    undo();
                    setEditMenuOpen(false);
                  }}
                >
                  <Undo2 />
                  <span>Undo</span>
                  <kbd>⌘Z</kbd>
                </button>
                <button
                  role="menuitem"
                  disabled={!historyState.canRedo}
                  onClick={() => {
                    redo();
                    setEditMenuOpen(false);
                  }}
                >
                  <Redo2 />
                  <span>Redo</span>
                  <kbd>⇧⌘Z</kbd>
                </button>
              </div>
            )}
          </div>
          <div className="menu-anchor" ref={viewMenuRef}>
            <button
              className={`menu-trigger ${viewMenuOpen ? "active" : ""}`}
              onClick={() => {
                setEditMenuOpen(false);
                setViewMenuOpen((open) => !open);
              }}
            >
              View
            </button>
            {viewMenuOpen && (
              <div className="edit-menu view-menu" role="menu">
                <button
                  role="menuitemcheckbox"
                  aria-checked={rulersVisible}
                  onClick={() => setRulersVisible((visible) => !visible)}
                >
                  <span className="menu-check">{rulersVisible ? "✓" : ""}</span>
                  <span>Show rulers</span>
                  <kbd>⇧R</kbd>
                </button>
                <button
                  role="menuitemcheckbox"
                  aria-checked={gridVisible}
                  onClick={() => setGridVisible((visible) => !visible)}
                >
                  <span className="menu-check">{gridVisible ? "✓" : ""}</span>
                  <span>Show grid</span>
                  <kbd>⇧G</kbd>
                </button>
                <div className="menu-section-label">Toolbar</div>
                {(["top", "bottom"] as const).map((position) => (
                  <button
                    key={position}
                    role="menuitemradio"
                    aria-checked={toolbarPosition === position}
                    onClick={() => setToolbarPosition(position)}
                  >
                    <span className="menu-check">
                      {toolbarPosition === position ? "●" : ""}
                    </span>
                    <span>{position === "top" ? "Top" : "Bottom"}</span>
                    <span />
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
        <nav className="mode-switcher" aria-label="Editor mode">
          {MODES.map((item) => (
            <button
              key={item.id}
              className={mode === item.id ? "active" : ""}
              onClick={() => setMode(item.id)}
              title={`${item.label} mode (${item.shortcut})`}
            >
              {item.label}
            </button>
          ))}
        </nav>
        <div className="topbar-actions">
          <button
            className="theme-toggle"
            onClick={() =>
              setTheme((current) => (current === "dark" ? "light" : "dark"))
            }
            aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
            title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
          >
            {theme === "dark" ? <Sun /> : <Moon />}
          </button>
          <button className="share-button">Share</button>
        </div>
      </header>

      <section className="workspace">
        <aside className="left-panel">
          <Panel
            mode={mode}
            stats={stats}
            model={documentModel}
            selectedNodeIds={selectedNodeIds}
            onSelectNode={selectNode}
            onAddPage={addPage}
            onSelectPage={selectPage}
            onNavigateNode={(node) => rendererRef.current?.centerOnBounds(node)}
            onReorderNode={(draggedId, targetId, before) => {
              if (engineRef.current?.reorder_node(draggedId, targetId, before))
                refreshDocument();
            }}
            onToggleLock={(id, locked) => {
              if (engineRef.current?.set_node_locked(id, locked)) {
                if (locked && selectedNodeIdsRef.current.includes(id))
                  refreshDocument(
                    selectedNodeIdsRef.current.filter(
                      (selected) => selected !== id,
                    ),
                  );
                else refreshDocument();
              }
            }}
            onRenameNode={(id, name) => {
              if (
                name.trim() &&
                engineRef.current?.rename_node(id, name.trim())
              )
                refreshDocument();
            }}
          />
        </aside>

        <section
          className={`stage ${rulersVisible ? "with-rulers" : ""} toolbar-${toolbarPosition}`}
        >
          <div className="tool-rail" aria-label="Canvas tools">
            <ToolButton
              label="Select (V)"
              icon={<MousePointer2 />}
              active={canvasTool === "select"}
              disabled={mode !== "design"}
              onClick={() => setCanvasTool("select")}
            />
            <ToolButton
              label="Hand (H)"
              icon={<Hand />}
              active={canvasTool === "hand"}
              onClick={() => setCanvasTool("hand")}
            />
            <ToolButton
              label="Artboard"
              icon={<Frame />}
              disabled={mode !== "design"}
              active={artboardMenuOpen}
              onClick={() => setArtboardMenuOpen((open) => !open)}
            />
            <ToolButton
              label="Rectangle"
              icon={<Square />}
              disabled={mode !== "design"}
              onClick={() => addNode("rectangle")}
            />
            <ToolButton
              label="Text"
              icon={<Type />}
              disabled={mode !== "design"}
              onClick={() => addNode("text")}
            />
            <ToolButton
              label="Comment"
              icon={<MessageCircle />}
              disabled={mode === "developer"}
            />
          </div>

          {artboardMenuOpen && (
            <ArtboardMenu
              onChoose={addArtboard}
              onClose={() => setArtboardMenuOpen(false)}
            />
          )}

          <div className="canvas-wrap">
            <canvas
              ref={canvasRef}
              aria-label="Open Libra WebGPU editor canvas"
            />
            {gridVisible && (
              <CanvasGrid rendererRef={rendererRef} theme={theme} />
            )}
            <ArtboardGuides
              rendererRef={rendererRef}
              nodes={documentModel.nodes}
              artboards={guidedArtboards}
            />
            <TextOverlay
              rendererRef={rendererRef}
              nodes={documentModel.nodes}
              editingTextId={editingTextId}
            />
            <SelectionOverlay
              rendererRef={rendererRef}
              selected={selectedNodes}
            />
            {editingTextNode?.text && (
              <textarea
                className="text-editor-overlay"
                defaultValue={editingTextNode.text.content}
                autoFocus
                wrap={
                  editingTextNode.text.sizing === "auto_width" ? "off" : "soft"
                }
                style={textEditorStyle(editingTextNode, rendererRef.current)}
                onBlur={(event) => {
                  updateNodeText(editingTextNode, {
                    ...editingTextNode.text!,
                    content: event.currentTarget.value,
                  });
                  setEditingTextId(undefined);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Escape") setEditingTextId(undefined);
                }}
                aria-label="Edit text content"
              />
            )}
            {error && (
              <div className="error-card">
                <strong>Renderer unavailable</strong>
                <span>{error}</span>
              </div>
            )}
          </div>

          {rulersVisible && <Rulers rendererRef={rendererRef} theme={theme} />}

          <div className="zoom-controls">
            <button
              onClick={() => rendererRef.current?.zoomBy(1 / 1.2)}
              aria-label="Zoom out"
            >
              −
            </button>
            <button onClick={() => rendererRef.current?.resetView()}>
              {Math.round(stats.zoom * 100)}%
            </button>
            <button
              onClick={() => rendererRef.current?.zoomBy(1.2)}
              aria-label="Zoom in"
            >
              +
            </button>
            <button
              onClick={() => rendererRef.current?.zoomToFit()}
              title="Zoom to fit (F)"
            >
              Fit
            </button>
          </div>
        </section>

        <aside className="right-panel">
          <p className="eyebrow">{mode}</p>
          {mode === "design" && (
            <Properties
              selected={selectedNodes}
              documentColors={documentColors}
              onAddDocumentColor={addDocumentColor}
              onAlign={alignSelected}
              onDelete={deleteSelected}
              onGroup={groupSelected}
              onStyleChange={updateNodeStyle}
              onBoundsChange={updateNodeBounds}
              onOpacityChange={updateNodeOpacity}
              onShadowsChange={updateNodeShadows}
              onTextChange={updateNodeText}
              onTransformChange={updateNodeTransform}
              onLayoutChange={updateNodeLayout}
              onWidthSizingChange={updateNodeWidthSizing}
              onArtboardGuideChange={updateArtboardGuide}
            />
          )}
          {mode === "developer" && <Inspect />}
          {mode === "review" && <Review />}
        </aside>
      </section>
    </main>
  );
}

function textEditorStyle(node: NodeSummary, renderer?: OpenLibraRenderer) {
  const view = renderer?.getViewState() ?? { pan: { x: 0, y: 0 }, zoom: 1 };
  const text = node.text!;
  return {
    left: node.x * view.zoom + view.pan.x,
    top: node.y * view.zoom + view.pan.y,
    width: node.width * view.zoom,
    height: node.height * view.zoom,
    fontFamily: text.font_family,
    fontWeight: text.font_weight,
    fontStyle: text.font_style,
    fontSize: text.font_size * view.zoom,
    lineHeight: text.line_height,
    letterSpacing: text.letter_spacing * view.zoom,
    textAlign: text.horizontal_align,
    whiteSpace: text.sizing === "auto_width" ? "pre" : "pre-wrap",
    overflow: text.sizing === "fixed" ? "auto" : "hidden",
    color: rgbaToHex(node.fill),
  } as const;
}

function measureTextBounds(node: NodeSummary, text: TextStyleSummary) {
  if (text.sizing === "fixed") return undefined;
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (!context) return undefined;
  context.font = `${text.font_style} ${text.font_weight} ${text.font_size}px ${JSON.stringify(text.font_family)}, sans-serif`;
  const measure = (value: string) =>
    context.measureText(value).width +
    Math.max(0, value.length - 1) * text.letter_spacing;
  let lines: string[];
  if (text.sizing === "auto_width") {
    lines = text.content.split("\n");
  } else {
    lines = [];
    for (const paragraph of text.content.split("\n")) {
      const words = paragraph.split(/\s+/);
      let line = "";
      for (const word of words) {
        const candidate = line ? `${line} ${word}` : word;
        if (line && measure(candidate) > node.width) {
          lines.push(line);
          line = word;
        } else line = candidate;
      }
      lines.push(line);
    }
  }
  return {
    width:
      text.sizing === "auto_width"
        ? Math.max(8, ...lines.map(measure))
        : node.width,
    height: Math.max(8, lines.length * text.font_size * text.line_height),
  };
}
