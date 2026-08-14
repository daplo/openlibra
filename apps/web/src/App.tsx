import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type DragEvent as ReactDragEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import "@fontsource/lexend-deca/300.css";
import "@fontsource/lexend-deca/400.css";
import "@fontsource/lexend-deca/500.css";
import "@fontsource/lexend-deca/600.css";
import "@fontsource/lexend-deca/700.css";
import {
  Check,
  ChevronRight,
  Component,
  FileArchive,
  FilePlus2,
  FolderClock,
  FolderOpen,
  Frame,
  Hand,
  MessageCircle,
  Moon,
  MousePointer2,
  Redo2,
  Save,
  Square,
  Shapes,
  Sun,
  Type,
  Undo2,
} from "lucide-react";
import {
  ArtboardGuides,
  CanvasGrid,
  IsolationOverlay,
  MediaOverlay,
  Rulers,
  SelectionOverlay,
  SpacingOverlay,
  TextOverlay,
  VectorOverlay,
} from "./components/CanvasOverlays";
import { ArtboardMenu } from "./components/ArtboardMenu";
import { ShapeMenu, type VectorShape } from "./components/ShapeMenu";
import { Inspect, Review, ToolButton } from "./components/EditorChrome";
import { Panel } from "./components/EditorSidebar";
import { Properties } from "./components/PropertiesPanel";
import { LibraryView } from "./components/LibraryView";
import { ARTBOARD_PRESETS, EMPTY_STATS, MODES } from "./editor/constants";
import { figmaFileToImport } from "./editor/figma-import";
import { exportFramePng } from "./editor/export-frame";
import { exportVectorSvg } from "./editor/export-vector";
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
import {
  createProjectPreview,
  getLastDocumentId,
  getRecentDocument,
  listArchivedDocuments,
  listRecoverySnapshots,
  listRecentDocuments,
  removeRecentDocument,
  storeRecentDocument,
  storeRecoverySnapshot,
  setLastDocumentId,
  type RecentDocument,
} from "./editor/recent-documents";
import {
  OPEN_LIBRA_PROJECT_MIME,
  parseProject,
  serializeProject,
} from "./editor/project-format";
import type {
  DocumentReadModel,
  Mode,
  NodeSummary,
  ShadowSummary,
  TextStyleAsset,
  TextStyleSummary,
  TypographyStyle,
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
  const copiedNodeIdsRef = useRef<string[]>([]);
  const inputControllerRef = useRef<EditorInputController | undefined>(
    undefined,
  );
  const canvasToolRef = useRef<CanvasTool>("select");
  const themeRef = useRef<ColorTheme>("dark");
  const pendingSceneFrameRef = useRef<number | undefined>(undefined);
  const documentModelRef = useRef<DocumentReadModel | undefined>(undefined);
  const nodesByIdRef = useRef<Map<string, NodeSummary>>(new Map());
  const fileMenuRef = useRef<HTMLDivElement>(null);
  const documentSwitcherRef = useRef<HTMLDivElement>(null);
  const documentFileInputRef = useRef<HTMLInputElement>(null);
  const figmaFileInputRef = useRef<HTMLInputElement>(null);
  const editMenuRef = useRef<HTMLDivElement>(null);
  const viewMenuRef = useRef<HTMLDivElement>(null);
  const [mode, setMode] = useState<Mode>("design");
  const [leftPanelWidth, setLeftPanelWidth] = useState(240);
  const [rightPanelWidth, setRightPanelWidth] = useState(250);
  const [libraryComponentId, setLibraryComponentId] = useState<string>();
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [librarySection, setLibrarySection] = useState<
    "projects" | "components"
  >("projects");
  const [recentDocuments, setRecentDocuments] = useState<RecentDocument[]>([]);
  const [archivedDocuments, setArchivedDocuments] = useState<RecentDocument[]>(
    [],
  );
  const [currentRecentDocumentId, setCurrentRecentDocumentId] =
    useState<string>();
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
  const isolationRootIdRef = useRef<string | undefined>(undefined);
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
  const [documentName, setDocumentName] = useState("Engine study.libra");
  const [isDocumentDirty, setIsDocumentDirty] = useState(false);
  const savedDocumentJsonRef = useRef<string | undefined>(undefined);
  const lastRecoverySnapshotAtRef = useRef(new Map<string, number>());
  const [autosaveState, setAutosaveState] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");
  const [editingTextId, setEditingTextId] = useState<string>();
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
  const [fileMenuOpen, setFileMenuOpen] = useState(false);
  const [documentSwitcherOpen, setDocumentSwitcherOpen] = useState(false);
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
  nodesByIdRef.current = nodesById;
  const selectedNodes = useMemo(
    () =>
      selectedNodeIds
        .map((id) => nodesById.get(id))
        .filter((node): node is NodeSummary => node !== undefined),
    [nodesById, selectedNodeIds],
  );
  const selectedComponentMaster = selectedNodes.some((node) =>
    isComponentMasterNode(node.id, nodesById),
  );
  const selectedMasterRoot = selectedNodes[0]
    ? findComponentMasterRoot(selectedNodes[0].id, nodesById)
    : undefined;
  const editableSelectedNodes =
    selectedComponentMaster && !isolationRootId ? [] : selectedNodes;
  const editingTextNode = editingTextId
    ? nodesById.get(editingTextId)
    : undefined;
  const isolationRoot = isolationRootId
    ? nodesById.get(isolationRootId)
    : undefined;
  const componentWorkspace = useMemo(() => {
    if (!isolationRootId) return undefined;
    for (const component of documentModel.components) {
      const variant = component.variants.find(
        (item) => item.source_root_id === isolationRootId,
      );
      if (variant) return { component, variant };
    }
    return undefined;
  }, [documentModel.components, isolationRootId]);
  const isolatedModel = useMemo(() => {
    if (!isolationRootId) return documentModel;
    const visibleNodes = documentModel.nodes
      .filter((node) => isNodeWithinRoot(node.id, isolationRootId, nodesById))
      .map((node) => {
        if (node.id !== isolationRootId) return node;
        const isolatedRoot = { ...node };
        delete isolatedRoot.parent_id;
        return isolatedRoot;
      });
    return { ...documentModel, nodes: visibleNodes };
  }, [documentModel, isolationRootId, nodesById]);
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
  isolationRootIdRef.current = isolationRootId;

  useEffect(() => {
    if (isolationRootId && !nodesById.has(isolationRootId))
      setIsolationRootId(undefined);
  }, [isolationRootId, nodesById]);

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

  useEffect(() => {
    void refreshRecentDocuments();
  }, []);

  useEffect(() => {
    if (!isDocumentDirty || !engineRef.current) return;
    const timeout = window.setTimeout(() => void autosaveDocument(), 800);
    return () => window.clearTimeout(timeout);
    // documentModel changes after every committed engine mutation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [documentModel, isDocumentDirty, documentName, currentRecentDocumentId]);

  useEffect(() => {
    const warnBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!isDocumentDirty) return;
      event.preventDefault();
    };
    window.addEventListener("beforeunload", warnBeforeUnload);
    return () => window.removeEventListener("beforeunload", warnBeforeUnload);
  }, [isDocumentDirty]);

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

  function replaceDocumentEngine(
    engine: DocumentEngine,
    name: string,
    recentDocumentId?: string,
  ) {
    flushPendingSceneRefresh();
    const previous = engineRef.current;
    engineRef.current = engine;
    savedDocumentJsonRef.current = engine.document_json();
    setDocumentName(name);
    setCurrentRecentDocumentId(recentDocumentId);
    setLastDocumentId(recentDocumentId);
    setAutosaveState("saved");
    setIsDocumentDirty(false);
    setIsolationRootId(undefined);
    setEditingTextId(undefined);
    setLibraryOpen(false);
    setLibraryComponentId(undefined);
    copiedNodeIdsRef.current = [];
    setError(undefined);
    refreshDocument([]);
    rendererRef.current?.resetView();
    previous?.free();
  }

  async function preserveCurrentDocument() {
    const engine = engineRef.current;
    if (!engine) return true;
    const id = currentRecentDocumentId ?? crypto.randomUUID();
    const stored = await rememberDocument(engine, documentName, id);
    return (
      stored ||
      window.confirm(
        "This document could not be stored locally. Continue and discard it?",
      )
    );
  }

  async function newDocument() {
    setFileMenuOpen(false);
    setDocumentSwitcherOpen(false);
    if (!(await preserveCurrentDocument())) return;
    const id = crypto.randomUUID();
    const name = nextUntitledDocumentName();
    const engine = DocumentEngine.new_blank();
    replaceDocumentEngine(engine, name, id);
    void rememberDocument(engine, name, id);
  }

  async function requestOpenDocument() {
    setFileMenuOpen(false);
    setDocumentSwitcherOpen(false);
    if (!(await preserveCurrentDocument())) return;
    documentFileInputRef.current?.click();
  }

  async function openDocument(file: File) {
    if (file.size > 250 * 1024 * 1024) {
      setError("Open Libra documents must be 250 MB or smaller.");
      return;
    }
    try {
      const engine = DocumentEngine.load_json(parseProject(await file.text()));
      const recentDocumentId = crypto.randomUUID();
      replaceDocumentEngine(engine, file.name, recentDocumentId);
      void rememberDocument(engine, file.name, recentDocumentId);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : `Could not open document: ${String(cause)}`,
      );
    }
  }

  function saveDocument() {
    const engine = engineRef.current;
    if (!engine) return;
    setFileMenuOpen(false);
    const json = engine.document_json();
    const blob = new Blob([serializeProject(json)], {
      type: OPEN_LIBRA_PROJECT_MIME,
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = /\.(libra|olibra|json)$/i.test(documentName)
      ? documentName
      : `${documentName}.libra`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
    savedDocumentJsonRef.current = json;
    setIsDocumentDirty(false);
    void rememberDocument(
      engine,
      documentName,
      currentRecentDocumentId ?? crypto.randomUUID(),
    );
  }

  async function refreshRecentDocuments() {
    try {
      const [recent, archived] = await Promise.all([
        listRecentDocuments(),
        listArchivedDocuments(),
      ]);
      setRecentDocuments(recent);
      setArchivedDocuments(archived);
    } catch {
      // IndexedDB may be unavailable in hardened/private browser contexts.
      setRecentDocuments([]);
      setArchivedDocuments([]);
    }
  }

  async function rememberDocument(
    engine: DocumentEngine,
    name: string,
    id: string,
  ) {
    const json = engine.document_json();
    const model = JSON.parse(engine.read_model_json()) as DocumentReadModel;
    try {
      const existing = await getRecentDocument(id);
      if (engineRef.current !== engine) return false;
      await storeRecentDocument({
        id,
        name,
        json,
        updatedAt: Date.now(),
        pageCount: model.pages.length,
        objectCount: model.nodes.length,
        preview:
          !existing || existing.coverPageId === model.active_page_id
            ? createProjectPreview(model)
            : existing.preview,
        pages: model.pages,
        coverPageId: existing?.coverPageId ?? model.active_page_id,
        archivedAt: existing?.archivedAt,
      });
      if (engineRef.current === engine) {
        setCurrentRecentDocumentId(id);
        setLastDocumentId(id);
      }
      await refreshRecentDocuments();
      return true;
    } catch {
      setError(
        "The document is available, but its recent-project preview could not be stored.",
      );
      return false;
    }
  }

  async function autosaveDocument() {
    const engine = engineRef.current;
    if (!engine) return;
    const id = currentRecentDocumentId ?? crypto.randomUUID();
    const name = documentName;
    const snapshotJson = engine.document_json();
    setAutosaveState("saving");
    const stored = await rememberDocument(engine, name, id);
    if (engineRef.current !== engine) return;
    if (!stored) {
      setAutosaveState("error");
      return;
    }
    const now = Date.now();
    const lastSnapshotAt = lastRecoverySnapshotAtRef.current.get(id) ?? 0;
    if (now - lastSnapshotAt >= 5 * 60 * 1000) {
      try {
        await storeRecoverySnapshot({
          id: crypto.randomUUID(),
          documentId: id,
          name,
          json: snapshotJson,
          createdAt: now,
        });
        lastRecoverySnapshotAtRef.current.set(id, now);
      } catch {
        // The primary autosave succeeded, so snapshot failure is non-fatal.
      }
    }
    if (engineRef.current !== engine) return;
    setAutosaveState("saved");
  }

  function nextUntitledDocumentName() {
    const names = new Set([
      documentName,
      ...recentDocuments.map((document) => document.name),
    ]);
    let number = 1;
    while (
      names.has(number === 1 ? "Untitled.libra" : `Untitled ${number}.libra`)
    )
      number += 1;
    return number === 1 ? "Untitled.libra" : `Untitled ${number}.libra`;
  }

  async function openRecentDocument(document: RecentDocument) {
    setDocumentSwitcherOpen(false);
    if (document.id === currentRecentDocumentId) {
      setLibraryOpen(false);
      return;
    }
    if (!(await preserveCurrentDocument())) return;
    try {
      const engine = DocumentEngine.load_json(document.json);
      replaceDocumentEngine(engine, document.name, document.id);
      void touchRecentDocument(document);
      setLibraryOpen(false);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : `Could not open recent document: ${String(cause)}`,
      );
    }
  }

  async function touchRecentDocument(document: RecentDocument) {
    try {
      await storeRecentDocument({ ...document, updatedAt: Date.now() });
      await refreshRecentDocuments();
    } catch {
      // Opening the stored project succeeded; a recency update is optional.
    }
  }

  async function removeRecentProject(id: string) {
    try {
      await removeRecentDocument(id);
      if (currentRecentDocumentId === id) {
        setCurrentRecentDocumentId(undefined);
        setLastDocumentId(undefined);
      }
      await refreshRecentDocuments();
    } catch {
      setError("Could not remove the project from recent documents.");
    }
  }

  async function renameRecentProject(document: RecentDocument) {
    const name = window.prompt("Project name", document.name)?.trim();
    if (!name || name === document.name) return;
    const renamed = { ...document, name, updatedAt: Date.now() };
    await storeRecentDocument(renamed);
    if (currentRecentDocumentId === document.id) setDocumentName(name);
    await refreshRecentDocuments();
  }

  async function duplicateRecentProject(document: RecentDocument) {
    const stem = document.name.replace(/\.(libra|olibra|json)$/i, "");
    const copy: RecentDocument = {
      ...document,
      id: crypto.randomUUID(),
      name: `${stem} copy.libra`,
      updatedAt: Date.now(),
      archivedAt: undefined,
    };
    await storeRecentDocument(copy);
    await refreshRecentDocuments();
  }

  async function archiveRecentProject(document: RecentDocument) {
    if (currentRecentDocumentId === document.id) {
      const currentEngine = engineRef.current;
      if (
        currentEngine &&
        !(await rememberDocument(currentEngine, documentName, document.id))
      )
        return;
      const currentDocument =
        (await getRecentDocument(document.id)) ?? document;
      await storeRecentDocument({
        ...currentDocument,
        archivedAt: Date.now(),
      });
      const id = crypto.randomUUID();
      const name = nextUntitledDocumentName();
      const engine = DocumentEngine.new_blank();
      replaceDocumentEngine(engine, name, id);
      await rememberDocument(engine, name, id);
    } else {
      await storeRecentDocument({ ...document, archivedAt: Date.now() });
    }
    await refreshRecentDocuments();
  }

  async function restoreRecentProject(document: RecentDocument) {
    await storeRecentDocument({
      ...document,
      archivedAt: undefined,
      updatedAt: Date.now(),
    });
    await refreshRecentDocuments();
  }

  async function setProjectCover(document: RecentDocument, pageId: string) {
    let engine: DocumentEngine | undefined;
    try {
      engine = DocumentEngine.load_json(document.json);
      if (!engine.set_active_page(pageId)) return;
      const model = JSON.parse(engine.read_model_json()) as DocumentReadModel;
      await storeRecentDocument({
        ...document,
        coverPageId: pageId,
        preview: createProjectPreview(model),
      });
      await refreshRecentDocuments();
    } catch {
      setError("Could not generate the selected project cover.");
    } finally {
      engine?.free();
    }
  }

  async function recoverRecentProject(document: RecentDocument) {
    try {
      const snapshots = await listRecoverySnapshots(document.id);
      if (snapshots.length === 0) {
        setError("No recovery snapshots are available for this project yet.");
        return;
      }
      const choices = snapshots
        .map(
          (snapshot, index) =>
            `${index + 1}. ${new Date(snapshot.createdAt).toLocaleString()}`,
        )
        .join("\n");
      const choice = window.prompt(
        `Choose a recovery snapshot (1-${snapshots.length}):\n${choices}`,
        "1",
      );
      if (!choice) return;
      const snapshot = snapshots[Number.parseInt(choice, 10) - 1];
      if (!snapshot) {
        setError("That recovery snapshot does not exist.");
        return;
      }
      if (!(await preserveCurrentDocument())) return;
      const engine = DocumentEngine.load_json(snapshot.json);
      replaceDocumentEngine(engine, document.name, document.id);
      setLibraryOpen(false);
      setIsDocumentDirty(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
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
    if (kind === "text") {
      const created = engine.node_json(id);
      editingTextInitialValueRef.current = created
        ? ((JSON.parse(created) as NodeSummary).text?.content ?? "")
        : "";
      setEditingTextId(id);
    }
  }

  function addVectorShape(shape: VectorShape) {
    const engine = engineRef.current;
    if (!engine) return;
    const parentId = preferredArtboardId(
      documentModel.nodes,
      selectedNodeIdsRef.current,
    );
    const id = engine.add_vector_shape(shape, parentId ?? "");
    refreshDocument([id]);
    setShapeMenuOpen(false);
  }

  function updateVectorParameters(
    node: NodeSummary,
    count: number,
    innerRatio: number,
  ) {
    if (
      engineRef.current?.update_vector_parameters(
        node.id,
        Math.round(count),
        innerRatio,
      )
    )
      refreshDocument([node.id]);
  }

  function updateVectorFillRule(
    node: NodeSummary,
    fillRule: "nonzero" | "evenodd",
  ) {
    if (engineRef.current?.set_vector_fill_rule(node.id, fillRule))
      refreshDocument([node.id]);
  }

  function convertVectorToPath(node: NodeSummary) {
    if (engineRef.current?.convert_vector_to_path(node.id))
      refreshDocument([node.id]);
  }

  function exportSelectedVector(node: NodeSummary) {
    try {
      exportVectorSvg(node);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
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

  function renamePage(id: string, name: string) {
    const trimmedName = name.trim();
    if (!trimmedName || !engineRef.current?.rename_page(id, trimmedName))
      return;
    refreshDocument();
  }

  function deletePage(id: string) {
    if (!engineRef.current?.delete_page(id)) {
      setError(
        documentModel.pages.length <= 1
          ? "A document must contain at least one page."
          : "Pages containing component masters cannot be deleted.",
      );
      return;
    }
    refreshDocument([]);
    rendererRef.current?.resetView();
  }

  function deleteSelected() {
    if (!selectionCanBeEdited()) return;
    const engine = engineRef.current;
    if (!engine || selectedNodeIds.length === 0) return;
    let changed = false;
    for (const id of selectedNodeIds)
      changed = engine.delete_node(id) || changed;
    if (!changed) return;
    refreshDocument([]);
  }

  function groupSelected() {
    if (!selectionCanBeEdited()) return;
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

  function ungroupSelected(node: NodeSummary) {
    if (!selectionCanBeEdited()) return;
    if (!engineRef.current?.ungroup_nodes(node.id)) return;
    const childIds = documentModel.nodes
      .filter((candidate) => candidate.parent_id === node.id)
      .map((candidate) => candidate.id);
    refreshDocument(childIds);
  }

  function copySelection() {
    if (!selectionCanBeEdited()) return;
    copiedNodeIdsRef.current = [...selectedNodeIdsRef.current];
  }

  function pasteSelection() {
    const engine = engineRef.current;
    if (!engine || copiedNodeIdsRef.current.length === 0) return;
    try {
      const json = engine.duplicate_nodes(
        JSON.stringify(copiedNodeIdsRef.current),
      );
      const ids = JSON.parse(json) as string[];
      if (ids.length > 0) {
        copiedNodeIdsRef.current = ids;
        refreshDocument(ids);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }

  function createComponent(node: NodeSummary) {
    const id = engineRef.current?.create_component(node.id, node.name);
    if (id) refreshDocument([node.id]);
  }

  function createComponentInstance(componentId: string, variantId: string) {
    const engine = engineRef.current;
    if (!engine) return;
    const parentId = preferredArtboardId(documentModel.nodes, []);
    const id = engine.create_component_instance(
      componentId,
      variantId,
      parentId ?? "",
    );
    if (id) refreshDocument([id]);
  }

  function changeInstanceVariant(node: NodeSummary, variantId: string) {
    const id = engineRef.current?.set_instance_variant(node.id, variantId);
    if (id) refreshDocument([id]);
  }

  function resetComponentInstance(node: NodeSummary) {
    const id = engineRef.current?.reset_component_instance(node.id);
    if (id) refreshDocument([id]);
  }

  function detachComponentInstance(node: NodeSummary) {
    if (engineRef.current?.detach_component_instance(node.id))
      refreshDocument([node.id]);
  }

  function swapComponentInstance(node: NodeSummary, componentId: string) {
    const variantId = documentModel.components.find(
      (component) => component.id === componentId,
    )?.variants[0]?.id;
    if (!variantId) return;
    const id = engineRef.current?.swap_component_instance(
      node.id,
      componentId,
      variantId,
    );
    if (id) refreshDocument([id]);
  }

  function goToMainComponent(node: NodeSummary) {
    const sourceRootId = documentModel.components
      .find((component) => component.id === node.component_id)
      ?.variants.find(
        (variant) => variant.id === node.component_variant_id,
      )?.source_root_id;
    if (sourceRootId) editMainComponent(sourceRootId);
  }

  function addSelectedComponentVariant(componentId: string) {
    const node = selectedNodes[0];
    if (!node || node.locked || node.component_id || node.instance_root_id)
      return;
    const id = engineRef.current?.add_component_variant(
      componentId,
      node.id,
      node.name,
    );
    if (id) refreshDocument([node.id]);
  }

  function duplicateComponentVariant(
    componentId: string,
    sourceVariantId: string,
    name: string,
  ) {
    const id = engineRef.current?.duplicate_component_variant(
      componentId,
      sourceVariantId,
      name,
    );
    if (id) refreshDocument([id]);
  }

  function editMainComponent(sourceRootId: string) {
    const source = nodesByIdRef.current.get(sourceRootId);
    if (!source) return;
    setLibraryOpen(false);
    setIsolationRootId(sourceRootId);
    applySelection([sourceRootId]);
    requestAnimationFrame(() => rendererRef.current?.centerOnBounds(source));
  }

  function openCanvasComponentMenu(clientX: number, clientY: number) {
    if (isolationRootIdRef.current) return;
    const renderer = rendererRef.current;
    const engine = engineRef.current;
    const model = documentModelRef.current;
    if (!renderer || !engine || !model) return;
    const world = renderer.worldPointFromClient(clientX, clientY);
    const hitId = engine.hit_test(world.x, world.y);
    if (!hitId) return;
    const sourceRootId = componentSourceRootForNode(
      hitId,
      nodesByIdRef.current,
      model,
    );
    if (!sourceRootId) return;
    setCanvasContextMenu({ x: clientX, y: clientY, sourceRootId });
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

  function selectionCanBeEdited() {
    const isolationId = isolationRootIdRef.current;
    return selectedNodeIdsRef.current.every(
      (id) => isolationId || !isComponentMasterNode(id, nodesByIdRef.current),
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

  async function exportSelectedFrame(node: NodeSummary, scale: number) {
    try {
      await exportFramePng(
        node,
        documentModel.nodes,
        documentModel.media_assets,
        scale,
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

  useEffect(() => {
    if (!fileMenuOpen) return;
    function closeFileMenu(event: PointerEvent) {
      if (
        event.target instanceof Node &&
        fileMenuRef.current?.contains(event.target)
      )
        return;
      setFileMenuOpen(false);
    }
    document.addEventListener("pointerdown", closeFileMenu, true);
    return () =>
      document.removeEventListener("pointerdown", closeFileMenu, true);
  }, [fileMenuOpen]);

  useEffect(() => {
    if (!documentSwitcherOpen) return;
    function closeDocumentSwitcher(event: PointerEvent) {
      if (
        event.target instanceof Node &&
        documentSwitcherRef.current?.contains(event.target)
      )
        return;
      setDocumentSwitcherOpen(false);
    }
    document.addEventListener("pointerdown", closeDocumentSwitcher, true);
    return () =>
      document.removeEventListener("pointerdown", closeDocumentSwitcher, true);
  }, [documentSwitcherOpen]);

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
          <div className="document-switcher" ref={documentSwitcherRef}>
            <button
              className={`file-name ${documentSwitcherOpen ? "active" : ""}`}
              aria-haspopup="menu"
              aria-expanded={documentSwitcherOpen}
              onClick={() => {
                setFileMenuOpen(false);
                setDocumentSwitcherOpen((open) => !open);
              }}
            >
              {documentName}
              {isDocumentDirty ? " •" : ""}
              <span
                className={`autosave-indicator ${autosaveState}`}
                title={autosaveLabel(autosaveState, isDocumentDirty)}
              />
              <ChevronRight aria-hidden="true" />
            </button>
            {documentSwitcherOpen && (
              <div className="document-switcher-menu" role="menu">
                <div className="document-switcher-heading">Documents</div>
                <button
                  className="document-switcher-item current"
                  role="menuitem"
                  onClick={() => setDocumentSwitcherOpen(false)}
                >
                  <Check aria-hidden="true" />
                  <span>
                    <strong>{documentName}</strong>
                    <small>
                      {autosaveLabel(autosaveState, isDocumentDirty)}
                    </small>
                  </span>
                </button>
                {recentDocuments
                  .filter((document) => document.id !== currentRecentDocumentId)
                  .slice(0, 6)
                  .map((document) => (
                    <button
                      className="document-switcher-item"
                      role="menuitem"
                      key={document.id}
                      onClick={() => void openRecentDocument(document)}
                    >
                      <span className="document-switcher-dot" />
                      <span>
                        <strong>{document.name}</strong>
                        <small>
                          {document.pageCount} page
                          {document.pageCount === 1 ? "" : "s"} ·{" "}
                          {document.objectCount.toLocaleString()} objects
                        </small>
                      </span>
                    </button>
                  ))}
                <div className="document-switcher-actions">
                  <button role="menuitem" onClick={() => void newDocument()}>
                    <FilePlus2 aria-hidden="true" /> New
                  </button>
                  <button
                    role="menuitem"
                    onClick={() => void requestOpenDocument()}
                  >
                    <FolderOpen aria-hidden="true" /> Open…
                  </button>
                  <button
                    role="menuitem"
                    onClick={() => {
                      setDocumentSwitcherOpen(false);
                      setLibraryComponentId(undefined);
                      setLibrarySection("projects");
                      setLibraryOpen(true);
                    }}
                  >
                    <FolderClock aria-hidden="true" /> View all
                  </button>
                </div>
              </div>
            )}
          </div>
          <div className="menu-anchor" ref={fileMenuRef}>
            <button
              className={`menu-trigger ${fileMenuOpen ? "active" : ""}`}
              aria-haspopup="menu"
              aria-expanded={fileMenuOpen}
              onClick={() => {
                setEditMenuOpen(false);
                setViewMenuOpen(false);
                setFileMenuOpen((open) => !open);
              }}
            >
              File
            </button>
            {fileMenuOpen && (
              <div className="edit-menu file-menu" role="menu">
                <button role="menuitem" onClick={newDocument}>
                  <FilePlus2 />
                  <span>New document</span>
                  <kbd>⌘N</kbd>
                </button>
                <button role="menuitem" onClick={requestOpenDocument}>
                  <FolderOpen />
                  <span>Open…</span>
                  <kbd>⌘O</kbd>
                </button>
                <button role="menuitem" onClick={saveDocument}>
                  <Save />
                  <span>Save</span>
                  <kbd>⌘S</kbd>
                </button>
                <button
                  role="menuitem"
                  onClick={() => {
                    setFileMenuOpen(false);
                    setLibraryComponentId(undefined);
                    setLibrarySection("projects");
                    setLibraryOpen(true);
                  }}
                >
                  <FolderClock />
                  <span>Recent projects…</span>
                  <kbd />
                </button>
                <div className="menu-section-label">Import</div>
                <button
                  role="menuitem"
                  onClick={() => {
                    setFileMenuOpen(false);
                    figmaFileInputRef.current?.click();
                  }}
                >
                  <FileArchive />
                  <span>Import Figma file…</span>
                  <kbd>.fig</kbd>
                </button>
              </div>
            )}
            <input
              ref={documentFileInputRef}
              className="hidden-file-input"
              data-testid="open-document-input"
              type="file"
              accept=".libra,.olibra,.json,application/json,application/vnd.openlibra.project+json,application/vnd.openlibra+json"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void openDocument(file);
                event.currentTarget.value = "";
              }}
            />
            <input
              ref={figmaFileInputRef}
              className="hidden-file-input"
              data-testid="file-menu-figma-upload"
              type="file"
              accept=".fig,application/octet-stream"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void importFigma(file);
                event.currentTarget.value = "";
              }}
            />
          </div>
          <div className="menu-anchor" ref={editMenuRef}>
            <button
              className={`menu-trigger ${editMenuOpen ? "active" : ""}`}
              onClick={() => {
                setFileMenuOpen(false);
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
                setFileMenuOpen(false);
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
            className={`library-trigger ${libraryOpen ? "active" : ""}`}
            onClick={() => {
              setLibraryComponentId(undefined);
              setLibrarySection("projects");
              setLibraryOpen((open) => !open);
            }}
          >
            Library
          </button>
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

      {libraryOpen && (
        <LibraryView
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
          onDuplicateRecent={(document) =>
            void duplicateRecentProject(document)
          }
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
      )}
      <section
        aria-hidden={libraryOpen}
        className={`workspace ${libraryOpen ? "workspace-hidden" : ""}`}
        style={
          {
            "--left-panel-width": `${leftPanelWidth}px`,
            "--right-panel-width": `${rightPanelWidth}px`,
          } as CSSProperties
        }
      >
        <aside className="left-panel">
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
          <PanelResizeHandle
            side="left"
            width={leftPanelWidth}
            onChange={setLeftPanelWidth}
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
              onClick={() => {
                setShapeMenuOpen(false);
                setArtboardMenuOpen((open) => !open);
              }}
            />
            <ToolButton
              label="Rectangle"
              icon={<Square />}
              disabled={mode !== "design"}
              onClick={() => addNode("rectangle")}
            />
            <ToolButton
              label="Shapes"
              icon={<Shapes />}
              active={shapeMenuOpen}
              disabled={mode !== "design"}
              onClick={() => {
                setArtboardMenuOpen(false);
                setShapeMenuOpen((open) => !open);
              }}
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
          {shapeMenuOpen && (
            <ShapeMenu
              onChoose={addVectorShape}
              onClose={() => setShapeMenuOpen(false)}
            />
          )}

          <div className="canvas-wrap">
            <canvas
              ref={canvasRef}
              aria-label="Open Libra WebGPU editor canvas"
              onContextMenu={(event) => {
                event.preventDefault();
                openCanvasComponentMenu(event.clientX, event.clientY);
              }}
              onDragOver={(event) => {
                if (
                  event.dataTransfer.types.includes("Files") ||
                  event.dataTransfer.types.includes(
                    "application/x-open-libra-asset",
                  )
                ) {
                  event.preventDefault();
                  event.dataTransfer.dropEffect = "copy";
                }
              }}
              onDrop={dropAssetOnCanvas}
            />
            {gridVisible && (
              <CanvasGrid rendererRef={rendererRef} theme={theme} />
            )}
            <ArtboardGuides
              rendererRef={rendererRef}
              nodes={documentModel.nodes}
              artboards={guidedArtboards}
            />
            <MediaOverlay
              rendererRef={rendererRef}
              nodes={documentModel.nodes}
              assets={documentModel.media_assets}
            />
            <VectorOverlay
              rendererRef={rendererRef}
              nodes={documentModel.nodes}
            />
            <TextOverlay
              rendererRef={rendererRef}
              nodes={documentModel.nodes}
              editingTextId={editingTextId}
            />
            {isolationRoot && (
              <IsolationOverlay
                rendererRef={rendererRef}
                root={isolationRoot}
                theme={theme}
              />
            )}
            <SelectionOverlay
              rendererRef={rendererRef}
              selected={selectedNodes}
            />
            {marqueeRect && (
              <div className="selection-marquee" style={marqueeRect} />
            )}
            {snapGuides.x !== undefined && (
              <div
                className="snap-guide vertical"
                style={{ left: snapGuides.x }}
              />
            )}
            {snapGuides.y !== undefined && (
              <div
                className="snap-guide horizontal"
                style={{ top: snapGuides.y }}
              />
            )}
            {isolationRoot && (
              <div
                className="component-isolation-bar"
                data-testid="component-isolation"
              >
                <Component aria-hidden="true" />
                <button
                  className="component-breadcrumb-link"
                  onClick={() => {
                    setLibraryComponentId(componentWorkspace?.component.id);
                    setLibraryOpen(true);
                  }}
                >
                  Components
                </button>
                <ChevronRight aria-hidden="true" />
                <strong>
                  {componentWorkspace?.component.name ?? isolationRoot.name}
                </strong>
                <ChevronRight aria-hidden="true" />
                <span>{componentWorkspace?.variant.name ?? "Default"}</span>
                <button
                  className="component-workspace-done"
                  onClick={() => setIsolationRootId(undefined)}
                >
                  <Check aria-hidden="true" />
                  Done
                </button>
              </div>
            )}
            <SpacingOverlay
              rendererRef={rendererRef}
              interactionCanvasRef={canvasRef}
              nodes={documentModel.nodes}
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
                  if (
                    event.currentTarget.value !==
                    editingTextInitialValueRef.current
                  )
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
            {canvasContextMenu && (
              <div
                className="canvas-context-menu"
                role="menu"
                style={{
                  left: canvasContextMenu.x,
                  top: canvasContextMenu.y,
                }}
              >
                <button
                  role="menuitem"
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={() => {
                    editMainComponent(canvasContextMenu.sourceRootId);
                    setCanvasContextMenu(undefined);
                  }}
                >
                  <Component aria-hidden="true" />
                  Edit component
                </button>
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
          <PanelResizeHandle
            side="right"
            width={rightPanelWidth}
            onChange={setRightPanelWidth}
          />
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
                  onClick={() => editMainComponent(selectedMasterRoot.id)}
                >
                  Edit component
                </button>
              </div>
            ) : (
              <Properties
                selected={editableSelectedNodes}
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
                onExportFrame={(node, scale) =>
                  void exportSelectedFrame(node, scale)
                }
                onCreateComponent={createComponent}
                onInstanceVariantChange={changeInstanceVariant}
                onInstanceReset={resetComponentInstance}
                onInstanceDetach={detachComponentInstance}
                onInstanceSwap={swapComponentInstance}
                onGoToMainComponent={goToMainComponent}
                onVectorParametersChange={updateVectorParameters}
                onVectorFillRuleChange={updateVectorFillRule}
                onVectorConvertToPath={convertVectorToPath}
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
        </aside>
      </section>
    </main>
  );
}

function PanelResizeHandle({
  side,
  width,
  onChange,
}: {
  side: "left" | "right";
  width: number;
  onChange: (width: number) => void;
}) {
  const clamp = (value: number) => Math.min(420, Math.max(190, value));
  const beginResize = (event: ReactPointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    const originX = event.clientX;
    const originWidth = width;
    const move = (moveEvent: PointerEvent) =>
      onChange(
        clamp(
          originWidth +
            (side === "left"
              ? moveEvent.clientX - originX
              : originX - moveEvent.clientX),
        ),
      );
    const stop = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop, { once: true });
  };
  return (
    <button
      className={`panel-resize-handle ${side}`}
      aria-label={`Resize ${side} sidebar`}
      title={`Resize ${side} sidebar`}
      onPointerDown={beginResize}
      onKeyDown={(event) => {
        if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
        const direction = event.key === "ArrowRight" ? 1 : -1;
        onChange(clamp(width + direction * (side === "left" ? 10 : -10)));
      }}
    />
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

function textStylesEqual(left: TextStyleSummary, right: TextStyleSummary) {
  return (
    left.content === right.content &&
    left.font_family === right.font_family &&
    left.font_weight === right.font_weight &&
    left.font_size === right.font_size &&
    left.line_height === right.line_height &&
    left.letter_spacing === right.letter_spacing &&
    left.horizontal_align === right.horizontal_align &&
    left.vertical_align === right.vertical_align &&
    left.font_style === right.font_style &&
    left.sizing === right.sizing
  );
}

function textTypographyEqual(left: TextStyleSummary, right: TextStyleSummary) {
  return (
    left.font_family === right.font_family &&
    left.font_weight === right.font_weight &&
    left.font_size === right.font_size &&
    left.line_height === right.line_height &&
    left.letter_spacing === right.letter_spacing &&
    left.horizontal_align === right.horizontal_align &&
    left.vertical_align === right.vertical_align &&
    left.font_style === right.font_style &&
    left.sizing === right.sizing
  );
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error(`Could not read ${file.name}.`));
    reader.readAsDataURL(file);
  });
}

function readImageDimensions(source: string) {
  return new Promise<{ width: number; height: number }>((resolve, reject) => {
    const image = new Image();
    image.onload = () =>
      resolve({ width: image.naturalWidth, height: image.naturalHeight });
    image.onerror = () => reject(new Error("The selected image is invalid."));
    image.src = source;
  });
}

function topLevelFrameAtPoint(nodes: NodeSummary[], x: number, y: number) {
  return nodes
    .filter(
      (node) =>
        node.kind === "frame" &&
        !node.parent_id &&
        x >= node.x &&
        x <= node.x + node.width &&
        y >= node.y &&
        y <= node.y + node.height,
    )
    .at(-1);
}

function isNodeWithinRoot(
  nodeId: string,
  rootId: string,
  nodesById: Map<string, NodeSummary>,
) {
  let current = nodesById.get(nodeId);
  const visited = new Set<string>();
  while (current && !visited.has(current.id)) {
    if (current.id === rootId) return true;
    visited.add(current.id);
    current = current.parent_id ? nodesById.get(current.parent_id) : undefined;
  }
  return false;
}

function findComponentMasterRoot(
  nodeId: string,
  nodesById: Map<string, NodeSummary>,
) {
  let current = nodesById.get(nodeId);
  const visited = new Set<string>();
  while (current && !visited.has(current.id)) {
    if (current.component_id && !current.instance_root_id) return current;
    visited.add(current.id);
    current = current.parent_id ? nodesById.get(current.parent_id) : undefined;
  }
  return undefined;
}

function isComponentMasterNode(
  nodeId: string,
  nodesById: Map<string, NodeSummary>,
) {
  return Boolean(findComponentMasterRoot(nodeId, nodesById));
}

function componentSourceRootForNode(
  nodeId: string,
  nodesById: Map<string, NodeSummary>,
  model: DocumentReadModel,
) {
  let current = nodesById.get(nodeId);
  const visited = new Set<string>();
  while (current && !visited.has(current.id)) {
    const componentId = current.component_id;
    const variantId = current.component_variant_id;
    if (componentId && variantId) {
      return model.components
        .find((component) => component.id === componentId)
        ?.variants.find((variant) => variant.id === variantId)?.source_root_id;
    }
    visited.add(current.id);
    current = current.parent_id ? nodesById.get(current.parent_id) : undefined;
  }
  return undefined;
}

function autosaveLabel(
  state: "idle" | "saving" | "saved" | "error",
  dirty: boolean,
) {
  if (state === "saving") return "Saving locally…";
  if (state === "error") return "Local save failed";
  if (state === "saved" && dirty) return "Saved locally · file not downloaded";
  if (state === "saved") return "Saved locally";
  return "Current";
}

function nearestSnap(moving: number[], targets: number[], threshold: number) {
  let best: { offset: number; target: number } | undefined;
  for (const source of moving) {
    for (const target of targets) {
      const offset = target - source;
      if (
        Math.abs(offset) <= threshold &&
        (!best || Math.abs(offset) < Math.abs(best.offset))
      )
        best = { offset, target };
    }
  }
  return best;
}
