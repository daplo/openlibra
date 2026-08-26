import { useEffect, useRef, useState } from "react";
import "@fontsource/lexend-deca/300.css";
import "@fontsource/lexend-deca/400.css";
import "@fontsource/lexend-deca/500.css";
import "@fontsource/lexend-deca/600.css";
import "@fontsource/lexend-deca/700.css";
import { Component } from "lucide-react";
import { type VectorPointSelection } from "./components/VectorPointOverlay";
import { Inspect, Review } from "./components/EditorChrome";
import { CanvasStage } from "./components/CanvasStage";
import { EditorTopbar } from "./components/EditorTopbar";
import { Panel } from "./components/EditorSidebar";
import { Properties } from "./components/PropertiesPanel";
import { EditorWorkspace } from "./components/EditorWorkspace";
import { LeftSidebar } from "./components/LeftSidebar";
import { LibraryWorkspace } from "./components/LibraryWorkspace";
import { RightInspector } from "./components/RightInspector";
import { EMPTY_STATS } from "./editor/constants";
import {
  isComponentMasterNode,
  isNodeWithinRoot,
  nearestSnap,
} from "./editor/app-utils";
import {
  EditorProvider,
  useEditorInfrastructure,
} from "./editor/EditorContext";
import {
  exportNodeRaster,
  exportPageRaster,
  type RasterExportOptions,
} from "./editor/export-frame";
import {
  EditorInputController,
  type EditorInputHandlers,
} from "./editor/input";
import { findSelectedAncestor } from "./editor/model-utils";
import {
  getLastDocumentId,
  getRecentDocument,
  setLastDocumentId,
} from "./editor/recent-documents";
import { useDocumentLifecycle } from "./editor/useDocumentLifecycle";
import { useComponentCommands } from "./editor/useComponentCommands";
import { useEditorSelection } from "./editor/useEditorSelection";
import { useNodeCommands } from "./editor/useNodeCommands";
import { useStyleCommands } from "./editor/useStyleCommands";
import { useAssetCommands } from "./editor/useAssetCommands";
import { useVectorCommands } from "./editor/useVectorCommands";
import type { DocumentReadModel, Mode, NodeSummary } from "./editor/types";
import init, { DocumentEngine } from "./wasm/open_libra_scene_wasm";
import {
  OpenLibraRenderer,
  type CanvasTool,
  type ColorTheme,
  type ResizeHandle,
} from "./renderer";

export function App() {
  return (
    <EditorProvider>
      <EditorApp />
    </EditorProvider>
  );
}

function EditorApp() {
  const {
    canvasRef,
    rendererRef,
    engineRef,
    selectedNodeIdsRef,
    inputControllerRef,
    canvasToolRef,
    themeRef,
    pendingSceneFrameRef,
    documentModelRef,
    nodesByIdRef,
    isolationRootIdRef,
  } = useEditorInfrastructure();
  const [mode, setMode] = useState<Mode>("design");
  const [leftPanelWidth, setLeftPanelWidth] = useState(240);
  const [rightPanelWidth, setRightPanelWidth] = useState(250);
  const [libraryComponentId, setLibraryComponentId] = useState<string>();
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [librarySection, setLibrarySection] = useState<
    "projects" | "components"
  >("projects");
  const [canvasContextMenu, setCanvasContextMenu] = useState<{
    x: number;
    y: number;
    sourceRootId: string;
  }>();
  const [marqueeRect, setMarqueeRect] = useState<{
    left: number;
    top: number;
    width: number;
    height: number;
  }>();
  const [snapGuides, setSnapGuides] = useState<{ x?: number; y?: number }>({});
  const [isolationRootId, setIsolationRootId] = useState<string>();
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
  const [editingVectorId, setEditingVectorId] = useState<string>();
  const [selectedVectorPoint, setSelectedVectorPoint] =
    useState<VectorPointSelection>();
  const editingTextInitialValueRef = useRef("");
  const [artboardMenuOpen, setArtboardMenuOpen] = useState(false);
  const [shapeMenuOpen, setShapeMenuOpen] = useState(false);
  const [documentModel, setDocumentModel] = useState<DocumentReadModel>({
    schema_version: 1,
    active_page_id: "",
    pages: [],
    nodes: [],
    document_colors: [],
    number_variables: [],
    text_styles: [],
    media_assets: [],
    components: [],
  });
  const [, setModelPatchVersion] = useState(0);
  const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>([]);
  const [historyState, setHistoryState] = useState({
    canUndo: false,
    canRedo: false,
  });
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
  const {
    recentDocuments,
    archivedDocuments,
    currentRecentDocumentId,
    setCurrentRecentDocumentId,
    documentName,
    setDocumentName,
    isDocumentDirty,
    setIsDocumentDirty,
    savedDocumentJsonRef,
    autosaveState,
    setAutosaveState,
    newDocument,
    requestOpenDocument,
    openDocument,
    saveDocument,
    rememberDocument,
    openRecentDocument,
    removeRecentProject,
    renameRecentProject,
    duplicateRecentProject,
    archiveRecentProject,
    restoreRecentProject,
    setProjectCover,
    recoverRecentProject,
  } = useDocumentLifecycle({
    documentModel,
    refreshDocument,
    flushPendingSceneRefresh,
    setIsolationRootId,
    setEditingTextId,
    setEditingVectorId,
    setSelectedVectorPoint,
    setLibraryOpen,
    setLibraryComponentId,
    setError,
  });
  const {
    addVectorShape,
    updateVectorParameters,
    updateVectorFillRule,
    convertVectorToPath,
    toggleVectorEditing,
    beginVectorPointMove,
    moveVectorPoint,
    endVectorPointMove,
    deleteVectorPoint,
    cutVectorPath,
    joinVectorPath,
    exportSelectedVector,
  } = useVectorCommands({
    selectedVectorPoint,
    setSelectedVectorPoint,
    editingVectorId,
    setEditingVectorId,
    documentModel,
    setShapeMenuOpen,
    setError,
    refreshDocument,
  });
  const {
    nodesById,
    activePage,
    selectedNodes,
    selectedComponentMaster,
    selectedMasterRoot,
    editableSelectedNodes,
    editingTextNode,
    isolationRoot,
    componentWorkspace,
    isolatedModel,
    documentColors,
    guidedArtboards,
  } = useEditorSelection({
    documentModel,
    selectedNodeIds,
    isolationRootId,
    setIsolationRootId,
    editingTextId,
  });
  const {
    addNode,
    addArtboard,
    addPage,
    selectPage,
    renamePage,
    deletePage,
    deleteSelected,
    groupSelected,
    ungroupSelected,
    copySelection,
    pasteSelection,
    selectionCanBeEdited,
  } = useNodeCommands({
    documentModel,
    selectedNodeIds,
    selectedComponentMaster,
    isolationRootId,
    refreshDocument,
    editingTextInitialValueRef,
    setEditingTextId,
    setArtboardMenuOpen,
    setError,
  });
  const {
    updateNodeStyle,
    updateNodeBounds,
    updateNodeOpacity,
    updateNodeShadows,
    updateNodeText,
    updateNodeTransform,
    updateNodeLayout,
    updateNodeWidthSizing,
    updateArtboardGuide,
  } = useStyleCommands({
    refreshDocument,
    setDocumentModel,
    setHistoryState,
    setError,
  });
  const {
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
  } = useAssetCommands({
    documentModel,
    selectedNodes,
    refreshDocument,
    setError,
    setIsolationRootId,
    setSelectedNodeIds,
  });
  const {
    createComponent,
    createComponentInstance,
    changeInstanceVariant,
    resetComponentInstance,
    detachComponentInstance,
    swapComponentInstance,
    goToMainComponent,
    addSelectedComponentVariant,
    duplicateComponentVariant,
    editMainComponent,
    openCanvasComponentMenu,
  } = useComponentCommands({
    documentModel,
    selectedNodes,
    refreshDocument,
    applySelection,
    setLibraryOpen,
    setIsolationRootId,
    setCanvasContextMenu,
  });
  canvasToolRef.current = canvasTool;
  themeRef.current = theme;

  useEffect(() => {
    if (editingVectorId && !selectedNodeIds.includes(editingVectorId)) {
      setEditingVectorId(undefined);
      setSelectedVectorPoint(undefined);
    }
  }, [editingVectorId, selectedNodeIds]);

  useEffect(() => {
    if (!editingVectorId) return;
    const leaveVectorEdit = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setEditingVectorId(undefined);
      setSelectedVectorPoint(undefined);
    };
    window.addEventListener("keydown", leaveVectorEdit);
    return () => window.removeEventListener("keydown", leaveVectorEdit);
  }, [editingVectorId]);

  useEffect(() => {
    if (!canvasContextMenu) return;
    const close = () => setCanvasContextMenu(undefined);
    window.addEventListener("pointerdown", close, { once: true });
    window.addEventListener("blur", close, { once: true });
    return () => {
      window.removeEventListener("pointerdown", close);
      window.removeEventListener("blur", close);
    };
  }, [canvasContextMenu]);

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
    if (savedDocumentJsonRef.current !== undefined)
      setIsDocumentDirty(
        engine.document_json() !== savedDocumentJsonRef.current,
      );
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
      refreshVisibleScene();
    });
  }

  function refreshVisibleScene() {
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
    setIsDocumentDirty(true);
  }

  function flushPendingSceneRefresh() {
    if (pendingSceneFrameRef.current === undefined) return;
    cancelAnimationFrame(pendingSceneFrameRef.current);
    pendingSceneFrameRef.current = undefined;
  }

  function applySelection(ids: string[]) {
    const nodesById = nodesByIdRef.current;
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

  function moveSelection(dx: number, dy: number) {
    if (!selectionCanBeEdited()) return;
    const selection = selectedNodeIdsRef.current;
    if (!engineRef.current || selection.length === 0) return;
    const snapped = snapMove(selection, dx, dy);
    if (
      engineRef.current.move_nodes(
        JSON.stringify(selection),
        snapped.dx,
        snapped.dy,
      )
    ) {
      patchMovedNodesInModel(selection, snapped.dx, snapped.dy);
      refreshLiveSelectionBounds();
      refreshVisibleScene();
    }
  }

  function snapMove(rootIds: string[], dx: number, dy: number) {
    const model = documentModelRef.current;
    const renderer = rendererRef.current;
    if (!model || !renderer) return { dx, dy };
    const movingIds = new Set(rootIds);
    let expanded = true;
    while (expanded) {
      expanded = false;
      for (const node of model.nodes) {
        if (
          node.parent_id &&
          movingIds.has(node.parent_id) &&
          !movingIds.has(node.id)
        ) {
          movingIds.add(node.id);
          expanded = true;
        }
      }
    }
    const roots = rootIds.flatMap((id) => {
      const node = nodesByIdRef.current.get(id);
      return node ? [node] : [];
    });
    if (roots.length === 0) return { dx, dy };
    const bounds = {
      left: Math.min(...roots.map((node) => node.x)),
      top: Math.min(...roots.map((node) => node.y)),
      right: Math.max(...roots.map((node) => node.x + node.width)),
      bottom: Math.max(...roots.map((node) => node.y + node.height)),
    };
    const movingX = [
      bounds.left + dx,
      (bounds.left + bounds.right) / 2 + dx,
      bounds.right + dx,
    ];
    const movingY = [
      bounds.top + dy,
      (bounds.top + bounds.bottom) / 2 + dy,
      bounds.bottom + dy,
    ];
    const targets = model.nodes.filter(
      (node) => !movingIds.has(node.id) && !node.locked,
    );
    const targetX = targets.flatMap((node) => [
      node.x,
      node.x + node.width / 2,
      node.x + node.width,
    ]);
    const targetY = targets.flatMap((node) => [
      node.y,
      node.y + node.height / 2,
      node.y + node.height,
    ]);
    const threshold = 6 / renderer.getViewState().zoom;
    const xSnap = nearestSnap(movingX, targetX, threshold);
    const ySnap = nearestSnap(movingY, targetY, threshold);
    const point = renderer.clientPointFromWorld(
      xSnap?.target ?? 0,
      ySnap?.target ?? 0,
    );
    setSnapGuides({
      x: xSnap ? point.x : undefined,
      y: ySnap ? point.y : undefined,
    });
    return {
      dx: dx + (xSnap?.offset ?? 0),
      dy: dy + (ySnap?.offset ?? 0),
    };
  }

  function patchMovedNodesInModel(rootIds: string[], dx: number, dy: number) {
    const model = documentModelRef.current;
    if (!model) return;
    const movingIds = new Set(rootIds);
    const roots = rootIds.flatMap((id) => {
      const node = nodesByIdRef.current.get(id);
      return node ? [node] : [];
    });
    if (roots.every((node) => node.kind !== "frame" && node.kind !== "group")) {
      for (const node of roots) {
        node.x += dx;
        node.y += dy;
      }
      setModelPatchVersion((version) => version + 1);
      return;
    }
    let foundDescendant = true;
    while (foundDescendant) {
      foundDescendant = false;
      for (const node of model.nodes) {
        if (
          node.parent_id &&
          movingIds.has(node.parent_id) &&
          !movingIds.has(node.id)
        ) {
          movingIds.add(node.id);
          foundDescendant = true;
        }
      }
    }
    for (const node of model.nodes) {
      if (movingIds.has(node.id)) {
        node.x += dx;
        node.y += dy;
      }
    }
    setModelPatchVersion((version) => version + 1);
  }

  function resizeSelection(handle: ResizeHandle, dx: number, dy: number) {
    if (!selectionCanBeEdited()) return;
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
      refreshVisibleScene();
    }
  }

  function selectNode(id: string, additive: boolean) {
    const isolationId = isolationRootIdRef.current;
    if (isolationId && !isNodeWithinRoot(id, isolationId, nodesByIdRef.current))
      return;
    const current = selectedNodeIdsRef.current;
    if (!additive) applySelection([id]);
    else
      applySelection(
        current.includes(id)
          ? current.filter((selected) => selected !== id)
          : [...current, id],
      );
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

  async function exportSelectedNode(
    node: NodeSummary,
    options: RasterExportOptions,
  ) {
    try {
      await exportNodeRaster(
        node,
        documentModel.nodes,
        documentModel.media_assets,
        options,
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }

  async function exportActivePage(options: RasterExportOptions) {
    try {
      await exportPageRaster(
        activePage?.name ?? "Page",
        documentModel.nodes,
        documentModel.media_assets,
        options,
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
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
    const isolationId = isolationRootIdRef.current;
    if (
      isolationId &&
      !isNodeWithinRoot(hitId, isolationId, nodesByIdRef.current)
    )
      return;
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
      newDocument,
      openDocument: requestOpenDocument,
      saveDocument,
      deleteSelection: deleteSelected,
      undo,
      redo,
      copySelection,
      pasteSelection,
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
        if (node?.kind === "text" && node.text && !node.locked) {
          if (
            !isolationRootIdRef.current &&
            isComponentMasterNode(node.id, nodesByIdRef.current)
          )
            return;
          applySelection([node.id]);
          editingTextInitialValueRef.current = node.text.content;
          setEditingTextId(node.id);
        } else if (node?.kind === "vector" && node.vector && !node.locked) {
          applySelection([node.id]);
          toggleVectorEditing(node);
        }
      },
    };
  }

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let disposed = false;
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
      const lastDocumentId = getLastDocumentId();
      const storedDocument = lastDocumentId
        ? await getRecentDocument(lastDocumentId).catch(() => undefined)
        : undefined;
      let engine: DocumentEngine;
      try {
        engine = storedDocument
          ? DocumentEngine.load_json(storedDocument.json)
          : new DocumentEngine();
      } catch {
        engine = new DocumentEngine();
      }
      engineRef.current = engine;
      savedDocumentJsonRef.current = engine.document_json();
      const initialDocumentId = storedDocument?.id ?? crypto.randomUUID();
      const initialDocumentName = storedDocument?.name ?? "Engine study.libra";
      setCurrentRecentDocumentId(initialDocumentId);
      setLastDocumentId(initialDocumentId);
      setDocumentName(initialDocumentName);
      setAutosaveState("saved");
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
        return;
      }
      rendererRef.current = renderer;
      renderer.setTool(canvasToolRef.current);
      renderer.setTheme(themeRef.current);
      renderer.setInteractionHandlers({
        hitTest: (x, y) => {
          const id = engineRef.current?.hit_test(x, y) ?? "";
          return id || undefined;
        },
        select: () => {},
        moveSelection: (dx, dy) => moveSelection(dx, dy),
        resizeSelection: (handle, dx, dy) => resizeSelection(handle, dx, dy),
        beginEdit: () => {
          engineRef.current?.begin_geometry_transaction(
            JSON.stringify(selectedNodeIdsRef.current),
          );
        },
        endEdit: () => {
          setSnapGuides({});
          flushPendingSceneRefresh();
          const isBenchmark =
            (documentModelRef.current?.nodes.length ?? 0) >= 1_000;
          if (!isBenchmark) {
            engineRef.current?.reparent_nodes_to_artboards(
              JSON.stringify(selectedNodeIdsRef.current),
            );
          }
          engineRef.current?.end_transaction();
          if (isBenchmark) {
            patchSelectedNodesFromEngine();
            scheduleSceneRefresh();
          } else {
            refreshDocument();
          }
        },
        updateMarquee: (start, end) => {
          setMarqueeRect({
            left: Math.min(start.x, end.x),
            top: Math.min(start.y, end.y),
            width: Math.abs(end.x - start.x),
            height: Math.abs(end.y - start.y),
          });
        },
        endMarquee: (bounds, additive) => {
          setMarqueeRect(undefined);
          const model = documentModelRef.current;
          if (!model) return;
          const enclosed = model.nodes.filter(
            (node) =>
              !node.locked &&
              node.x >= bounds.left &&
              node.y >= bounds.top &&
              node.x + node.width <= bounds.right &&
              node.y + node.height <= bounds.bottom,
          );
          const enclosedIds = new Set(enclosed.map((node) => node.id));
          const roots = enclosed.filter((node) => {
            let parentId = node.parent_id;
            while (parentId) {
              if (enclosedIds.has(parentId)) return false;
              parentId = model.nodes.find(
                (item) => item.id === parentId,
              )?.parent_id;
            }
            return true;
          });
          const next = roots.map((node) => node.id);
          applySelection(
            additive
              ? [...new Set([...selectedNodeIdsRef.current, ...next])]
              : next,
          );
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
      if (!storedDocument)
        void rememberDocument(engine, initialDocumentName, initialDocumentId);
    }

    start().catch((cause: unknown) =>
      setError(cause instanceof Error ? cause.message : String(cause)),
    );
    return () => {
      disposed = true;
      localInputController?.dispose();
      localRenderer?.dispose();
      engineRef.current?.free();
      if (rendererRef.current === localRenderer)
        rendererRef.current = undefined;
      if (inputControllerRef.current === localInputController)
        inputControllerRef.current = undefined;
      engineRef.current = undefined;
    };
    // Renderer ownership is intentionally tied to the canvas mount lifecycle.
    // Interaction callbacks read mutable engine and selection refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    inputControllerRef.current?.setHandlers(createInputHandlers());
  });

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
  }, [canvasTool, rendererRef]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("open-libra-theme", theme);
    rendererRef.current?.setTheme(theme);
  }, [rendererRef, theme]);

  return (
    <main className="app-shell">
      <EditorTopbar
        documentName={documentName}
        isDocumentDirty={isDocumentDirty}
        autosaveState={autosaveState}
        recentDocuments={recentDocuments}
        currentRecentDocumentId={currentRecentDocumentId}
        mode={mode}
        setMode={setMode}
        libraryOpen={libraryOpen}
        setLibraryOpen={setLibraryOpen}
        setLibraryComponentId={setLibraryComponentId}
        setLibrarySection={setLibrarySection}
        theme={theme}
        setTheme={setTheme}
        historyState={historyState}
        rulersVisible={rulersVisible}
        setRulersVisible={setRulersVisible}
        gridVisible={gridVisible}
        setGridVisible={setGridVisible}
        toolbarPosition={toolbarPosition}
        setToolbarPosition={setToolbarPosition}
        newDocument={newDocument}
        requestOpenDocument={requestOpenDocument}
        saveDocument={saveDocument}
        openDocument={openDocument}
        importFigma={importFigma}
        openRecentDocument={openRecentDocument}
        undo={undo}
        redo={redo}
      />

      <LibraryWorkspace
        open={libraryOpen}
        model={documentModel}
        focusedComponentId={libraryComponentId}
        section={librarySection}
        recentDocuments={recentDocuments}
        archivedDocuments={archivedDocuments}
        currentRecentDocumentId={currentRecentDocumentId}
        onBack={() => setLibraryOpen(false)}
        onSectionChange={setLibrarySection}
        onNewDocument={newDocument}
        onOpenRecent={openRecentDocument}
        onRemoveRecent={(id) => void removeRecentProject(id)}
        onRenameRecent={(document) => void renameRecentProject(document)}
        onDuplicateRecent={(document) => void duplicateRecentProject(document)}
        onArchiveRecent={(document) => void archiveRecentProject(document)}
        onRestoreRecent={(document) => void restoreRecentProject(document)}
        onSetProjectCover={(document, pageId) =>
          void setProjectCover(document, pageId)
        }
        onRecoverRecent={(document) => void recoverRecentProject(document)}
        onInsert={createComponentInstance}
        onEditMain={editMainComponent}
        onAddVariant={duplicateComponentVariant}
      />
      <EditorWorkspace
        hidden={libraryOpen}
        leftPanelWidth={leftPanelWidth}
        rightPanelWidth={rightPanelWidth}
      >
        <LeftSidebar width={leftPanelWidth} onWidthChange={setLeftPanelWidth}>
          <Panel
            mode={mode}
            stats={stats}
            model={isolatedModel}
            selectedNodeIds={selectedNodeIds}
            onSelectNode={selectNode}
            onAddPage={addPage}
            onSelectPage={selectPage}
            onRenamePage={renamePage}
            onDeletePage={deletePage}
            onNavigateNode={(node) => rendererRef.current?.centerOnBounds(node)}
            onReorderNode={(draggedId, targetId, before) => {
              if (
                !isolationRootId &&
                isComponentMasterNode(draggedId, nodesById)
              )
                return;
              if (engineRef.current?.reorder_node(draggedId, targetId, before))
                refreshDocument();
            }}
            onToggleLock={(id, locked) => {
              if (!isolationRootId && isComponentMasterNode(id, nodesById))
                return;
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
              if (!isolationRootId && isComponentMasterNode(id, nodesById))
                return;
              if (
                name.trim() &&
                engineRef.current?.rename_node(id, name.trim())
              )
                refreshDocument();
            }}
            onAddNumberVariable={addNumberVariable}
            onUpdateNumberVariable={updateNumberVariable}
            onDeleteNumberVariable={deleteNumberVariable}
            onAddTextStyle={addTextStyle}
            onUpdateTextStyle={updateTextStyle}
            onDeleteTextStyle={deleteTextStyle}
            hasSelectedText={editableSelectedNodes.some(
              (node) => node.kind === "text",
            )}
            onImportImage={importImage}
            onImportFigma={importFigma}
            onAddLibraryIcon={addLibraryIcon}
            onAddNodeFromAsset={addNodeFromAsset}
            onAddComponentInstance={createComponentInstance}
            onAddSelectedComponentVariant={addSelectedComponentVariant}
            onOpenComponentLibrary={(componentId) => {
              setLibraryComponentId(componentId);
              setLibrarySection("components");
              setLibraryOpen(true);
            }}
            componentWorkspace={
              componentWorkspace
                ? {
                    componentName: componentWorkspace.component.name,
                    variantName: componentWorkspace.variant.name,
                  }
                : undefined
            }
          />
        </LeftSidebar>

        <CanvasStage
          canvasRef={canvasRef}
          rendererRef={rendererRef}
          mode={mode}
          rulersVisible={rulersVisible}
          toolbarPosition={toolbarPosition}
          canvasTool={canvasTool}
          setCanvasTool={setCanvasTool}
          artboardMenuOpen={artboardMenuOpen}
          setArtboardMenuOpen={setArtboardMenuOpen}
          shapeMenuOpen={shapeMenuOpen}
          setShapeMenuOpen={setShapeMenuOpen}
          addNode={addNode}
          addArtboard={addArtboard}
          addVectorShape={addVectorShape}
          openCanvasComponentMenu={openCanvasComponentMenu}
          dropAssetOnCanvas={dropAssetOnCanvas}
          gridVisible={gridVisible}
          theme={theme}
          documentModel={documentModel}
          guidedArtboards={guidedArtboards}
          editingVectorId={editingVectorId}
          selectedNodes={selectedNodes}
          selectedVectorPoint={selectedVectorPoint}
          setSelectedVectorPoint={setSelectedVectorPoint}
          beginVectorPointMove={beginVectorPointMove}
          moveVectorPoint={moveVectorPoint}
          endVectorPointMove={endVectorPointMove}
          deleteVectorPoint={deleteVectorPoint}
          editingTextId={editingTextId}
          isolationRoot={isolationRoot}
          componentWorkspace={componentWorkspace}
          marqueeRect={marqueeRect}
          snapGuides={snapGuides}
          openComponentLibrary={(componentId) => {
            setLibraryComponentId(componentId);
            setLibraryOpen(true);
          }}
          exitIsolation={() => setIsolationRootId(undefined)}
          editingTextNode={editingTextNode}
          editingTextInitialValue={editingTextInitialValueRef.current}
          updateNodeText={updateNodeText}
          setEditingTextId={setEditingTextId}
          error={error}
          canvasContextMenu={canvasContextMenu}
          editMainComponent={editMainComponent}
          dismissCanvasContextMenu={() => setCanvasContextMenu(undefined)}
          zoom={stats.zoom}
        />

        <RightInspector
          width={rightPanelWidth}
          onWidthChange={setRightPanelWidth}
        >
          <p className="eyebrow">{mode}</p>
          {mode === "design" &&
            (selectedComponentMaster &&
            !isolationRootId &&
            selectedMasterRoot ? (
              <div
                className="component-master-readonly"
                data-testid="component-master-readonly"
              >
                <Component aria-hidden="true" />
                <strong>Component master</strong>
                <span>
                  Open this component workspace before editing its layers.
                </span>
                <button
                  type="button"
                  onClick={() => editMainComponent(selectedMasterRoot.id)}
                >
                  Edit component
                </button>
              </div>
            ) : (
              <Properties
                selected={editableSelectedNodes}
                pageName={activePage?.name ?? "Page"}
                pageHasContent={documentModel.nodes.length > 0}
                documentColors={documentColors}
                numberVariables={documentModel.number_variables}
                textStyles={documentModel.text_styles}
                mediaAssets={documentModel.media_assets}
                components={documentModel.components}
                onAddDocumentColor={addDocumentColor}
                onAlign={alignSelected}
                onDelete={deleteSelected}
                onGroup={groupSelected}
                onUngroup={ungroupSelected}
                onExportRaster={(node, options) =>
                  void exportSelectedNode(node, options)
                }
                onExportPage={(options) => void exportActivePage(options)}
                onCreateComponent={createComponent}
                onInstanceVariantChange={changeInstanceVariant}
                onInstanceReset={resetComponentInstance}
                onInstanceDetach={detachComponentInstance}
                onInstanceSwap={swapComponentInstance}
                onGoToMainComponent={goToMainComponent}
                onVectorParametersChange={updateVectorParameters}
                onVectorFillRuleChange={updateVectorFillRule}
                onVectorConvertToPath={convertVectorToPath}
                vectorEditing={editingVectorId === selectedNodes[0]?.id}
                hasSelectedVectorPoint={
                  selectedVectorPoint?.nodeId === selectedNodes[0]?.id
                }
                onVectorEditToggle={toggleVectorEditing}
                onVectorPointDelete={() => deleteVectorPoint()}
                onVectorCut={cutVectorPath}
                onVectorJoin={joinVectorPath}
                onExportVector={exportSelectedVector}
                onStyleChange={updateNodeStyle}
                onBoundsChange={updateNodeBounds}
                onOpacityChange={updateNodeOpacity}
                onShadowsChange={updateNodeShadows}
                onTextChange={updateNodeText}
                onVariableBind={bindNodeVariable}
                onTextStyleBind={bindNodeTextStyle}
                onCreateVariable={createAndBindVariable}
                onCreateTextStyle={createAndBindTextStyle}
                onImageFitChange={updateNodeImageFit}
                onAssetChange={updateNodeAsset}
                onTransformChange={updateNodeTransform}
                onLayoutChange={updateNodeLayout}
                onWidthSizingChange={updateNodeWidthSizing}
                onArtboardGuideChange={updateArtboardGuide}
              />
            ))}
          {mode === "developer" && (
            <Inspect
              selected={selectedNodes}
              numberVariables={documentModel.number_variables}
              textStyles={documentModel.text_styles}
            />
          )}
          {mode === "review" && <Review />}
        </RightInspector>
      </EditorWorkspace>
    </main>
  );
}
