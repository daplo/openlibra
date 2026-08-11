import { useEffect, useRef, useState } from "react";
import { AlignHorizontalJustifyCenter, AlignHorizontalJustifyEnd, AlignHorizontalJustifyStart, AlignVerticalJustifyCenter, AlignVerticalJustifyEnd, AlignVerticalJustifyStart, Columns3, FlipHorizontal2, FlipVertical2, Frame, Hand, MessageCircle, Moon, MousePointer2, Redo2, RotateCw, Rows3, Square, Sun, Type, Undo2 } from "lucide-react";
import init, { DocumentEngine } from "./wasm/open_libra_scene_wasm";
import { OpenLibraRenderer, type CanvasTool, type ColorTheme, type RenderStats, type ResizeHandle } from "./renderer";

type Mode = "design" | "developer" | "review";
type PageSummary = { id: number; name: string };
type ColorAsset = { id: number; name: string; value: string };
type ShadowSummary = { kind: "outer" | "inner"; color: number[]; offset_x: number; offset_y: number; blur: number; spread: number; enabled: boolean };
type NodeSummary = { id: number; name: string; kind: "frame" | "rectangle" | "group" | "text"; parent_id?: number; x: number; y: number; width: number; height: number; fill: number[]; stroke: number[]; stroke_width: number; corner_radius: number; opacity: number; rotation: number; flip_x: boolean; flip_y: boolean; shadows: ShadowSummary[]; layout_mode: "none" | "row" | "column"; layout_align: "start" | "center" | "end"; layout_justify: "start" | "center" | "end"; layout_gap: number; layout_padding: number[]; width_sizing: "fixed" | "fill"; auto_height: boolean; guide_mode: "none" | "grid" | "columns"; guide_count: number; guide_gap: number; guide_color: number[]; guide_opacity: number; locked: boolean };
type DocumentReadModel = { schema_version: number; active_page_id: number; pages: PageSummary[]; nodes: NodeSummary[]; document_colors: ColorAsset[] };

const MODES: { id: Mode; label: string; shortcut: string }[] = [
  { id: "design", label: "Design", shortcut: "1" },
  { id: "developer", label: "Developer", shortcut: "2" },
  { id: "review", label: "Review", shortcut: "3" },
];

const ARTBOARD_PRESETS = [
  { category: "Mobile", name: "Mobile compact", width: 375, height: 812 },
  { category: "Mobile", name: "Mobile standard", width: 390, height: 844 },
  { category: "Mobile", name: "Mobile large", width: 430, height: 932 },
  { category: "Tablet", name: "Tablet portrait", width: 768, height: 1024 },
  { category: "Tablet", name: "Tablet landscape", width: 1024, height: 768 },
  { category: "Desktop", name: "Laptop", width: 1280, height: 800 },
  { category: "Desktop", name: "Desktop", width: 1440, height: 900 },
  { category: "Desktop", name: "Full HD", width: 1920, height: 1080 },
  { category: "Presentation", name: "Slide 16:9", width: 1920, height: 1080 },
] as const;

const EMPTY_STATS: RenderStats = {
  fps: 0,
  frameMs: 0,
  sceneBuildMs: 0,
  uploadMs: 0,
  objects: 0,
  zoom: 1,
};

export function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<OpenLibraRenderer | undefined>(undefined);
  const engineRef = useRef<DocumentEngine | undefined>(undefined);
  const selectedNodeIdsRef = useRef<number[]>([]);
  const canvasToolRef = useRef<CanvasTool>("select");
  const themeRef = useRef<ColorTheme>("dark");
  const toolBeforeSpaceRef = useRef<CanvasTool | undefined>(undefined);
  const editMenuRef = useRef<HTMLDivElement>(null);
  const viewMenuRef = useRef<HTMLDivElement>(null);
  const [mode, setMode] = useState<Mode>("design");
  const [canvasTool, setCanvasTool] = useState<CanvasTool>("select");
  const [theme, setTheme] = useState<ColorTheme>(() => {
    const saved = localStorage.getItem("open-libra-theme");
    if (saved === "light" || saved === "dark") return saved;
    return matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
  });
  const [stats, setStats] = useState(EMPTY_STATS);
  const [error, setError] = useState<string>();
  const [editingText, setEditingText] = useState(false);
  const [artboardMenuOpen, setArtboardMenuOpen] = useState(false);
  const [documentModel, setDocumentModel] = useState<DocumentReadModel>({ schema_version: 1, active_page_id: 0, pages: [], nodes: [], document_colors: [] });
  const [selectedNodeIds, setSelectedNodeIds] = useState<number[]>([]);
  const [historyState, setHistoryState] = useState({ canUndo: false, canRedo: false });
  const [editMenuOpen, setEditMenuOpen] = useState(false);
  const [viewMenuOpen, setViewMenuOpen] = useState(false);
  const [rulersVisible, setRulersVisible] = useState(() => localStorage.getItem("open-libra-rulers") !== "hidden");
  canvasToolRef.current = canvasTool;
  themeRef.current = theme;

  function refreshDocument(selection = selectedNodeIdsRef.current) {
    const engine = engineRef.current;
    if (!engine) return;
    const model = JSON.parse(engine.read_model_json()) as DocumentReadModel;
    const validSelection = selection.filter((id) => model.nodes.some((node) => node.id === id));
    if (validSelection.length !== selection.length) {
      selectedNodeIdsRef.current = validSelection;
      setSelectedNodeIds(validSelection);
    }
    setDocumentModel(model);
    setHistoryState({ canUndo: engine.can_undo(), canRedo: engine.can_redo() });
    const selected = model.nodes.filter((node) => validSelection.includes(node.id));
    rendererRef.current?.setSelectionBounds(selected.length === 1 && selected[0].kind !== "group" ? selected[0] : undefined);
    rendererRef.current?.setScene(engine.scene_data());
  }

  function applySelection(ids: number[]) {
    selectedNodeIdsRef.current = ids;
    setSelectedNodeIds(ids);
    refreshDocument(ids);
  }

  function addNode(kind: "frame" | "rectangle") {
    const engine = engineRef.current;
    if (!engine) return;
    const parentId = preferredArtboardId(documentModel.nodes, selectedNodeIdsRef.current);
    const id = kind === "frame" ? engine.add_frame() : engine.add_rectangle_to(BigInt(parentId ?? 0));
    applySelection([Number(id)]);
  }

  function addArtboard(preset: (typeof ARTBOARD_PRESETS)[number]) {
    const engine = engineRef.current;
    if (!engine) return;
    try {
      const id = Number(engine.add_artboard(preset.name, preset.width, preset.height));
      applySelection([id]);
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
    applySelection([]);
    rendererRef.current?.resetView();
  }

  function selectPage(id: number) {
    if (!engineRef.current?.set_active_page(BigInt(id))) return;
    applySelection([]);
    rendererRef.current?.resetView();
  }

  function deleteSelected() {
    const engine = engineRef.current;
    if (!engine || selectedNodeIds.length === 0) return;
    let changed = false;
    for (const id of selectedNodeIds) changed = engine.delete_node(BigInt(id)) || changed;
    if (!changed) return;
    applySelection([]);
  }

  function groupSelected() {
    if (!engineRef.current || selectedNodeIds.length < 2) return;
    try {
      const groupId = engineRef.current.group_nodes(JSON.stringify(selectedNodeIds));
      applySelection([Number(groupId)]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }

  function moveSelection(dx: number, dy: number) {
    const selection = selectedNodeIdsRef.current;
    if (!engineRef.current || selection.length === 0) return;
    if (engineRef.current.move_nodes(JSON.stringify(selection), dx, dy)) refreshDocument(selection);
  }

  function resizeSelection(handle: ResizeHandle, dx: number, dy: number) {
    const selection = selectedNodeIdsRef.current;
    if (!engineRef.current || selection.length !== 1) return;
    const node = documentModel.nodes.find((candidate) => candidate.id === selection[0]);
    const angle = -(node?.rotation ?? 0) * Math.PI / 180;
    const localDx = dx * Math.cos(angle) - dy * Math.sin(angle);
    const localDy = dx * Math.sin(angle) + dy * Math.cos(angle);
    if (engineRef.current.resize_node(BigInt(selection[0]), handle, localDx, localDy)) refreshDocument(selection);
  }

  function selectNode(id: number, additive: boolean) {
    const current = selectedNodeIdsRef.current;
    if (!additive) applySelection([id]);
    else applySelection(current.includes(id) ? current.filter((selected) => selected !== id) : [...current, id]);
  }

  function updateNodeStyle(node: NodeSummary, change: Partial<{ fill: string; stroke: string; strokeWidth: number; cornerRadius: number }>) {
    const engine = engineRef.current;
    if (!engine) return;
    try {
      engine.set_node_style(
        BigInt(node.id),
        change.fill ?? rgbaToHex(node.fill),
        change.stroke ?? rgbaToHex(node.stroke),
        change.strokeWidth ?? node.stroke_width,
        change.cornerRadius ?? node.corner_radius,
      );
      refreshDocument();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }

  function updateNodeBounds(node: NodeSummary, change: Partial<{ x: number; y: number; width: number; height: number }>) {
    const engine = engineRef.current;
    if (!engine) return;
    if (engine.set_node_bounds(
      BigInt(node.id),
      change.x ?? node.x,
      change.y ?? node.y,
      change.width ?? node.width,
      change.height ?? node.height,
    )) refreshDocument();
  }

  function updateNodeOpacity(node: NodeSummary, opacity: number) {
    if (engineRef.current?.set_node_opacity(BigInt(node.id), opacity)) refreshDocument();
  }

  function updateNodeShadows(node: NodeSummary, shadows: ShadowSummary[]) {
    try {
      if (engineRef.current?.set_node_shadows(BigInt(node.id), JSON.stringify(shadows))) refreshDocument();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }

  function updateNodeTransform(node: NodeSummary, change: Partial<Pick<NodeSummary, "rotation" | "flip_x" | "flip_y">>) {
    if (engineRef.current?.set_node_transform(BigInt(node.id), change.rotation ?? node.rotation, change.flip_x ?? node.flip_x, change.flip_y ?? node.flip_y)) refreshDocument();
  }

  function updateNodeLayout(node: NodeSummary, change: Partial<Pick<NodeSummary, "layout_mode" | "layout_align" | "layout_justify" | "layout_gap" | "layout_padding" | "auto_height">>) {
    const padding = change.layout_padding ?? node.layout_padding;
    const engine = engineRef.current;
    if (!engine) return;
    let changed = engine.set_node_layout(BigInt(node.id), change.layout_mode ?? node.layout_mode, change.layout_align ?? node.layout_align, change.layout_justify ?? node.layout_justify, change.layout_gap ?? node.layout_gap, padding[0], padding[1], padding[2], padding[3]);
    if (change.auto_height !== undefined) changed = engine.set_node_auto_height(BigInt(node.id), change.auto_height) || changed;
    if (changed) refreshDocument();
  }

  function updateNodeWidthSizing(node: NodeSummary, widthSizing: NodeSummary["width_sizing"]) {
    if (engineRef.current?.set_node_width_sizing(BigInt(node.id), widthSizing)) refreshDocument();
  }

  function updateArtboardGuide(node: NodeSummary, change: Partial<Pick<NodeSummary, "guide_mode" | "guide_count" | "guide_gap" | "guide_color" | "guide_opacity">>) {
    try {
      if (engineRef.current?.set_artboard_guide(BigInt(node.id), change.guide_mode ?? node.guide_mode, change.guide_count ?? node.guide_count, change.guide_gap ?? node.guide_gap, rgbaToHex(change.guide_color ?? node.guide_color), change.guide_opacity ?? node.guide_opacity)) refreshDocument();
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
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
    if (engineRef.current?.align_nodes(JSON.stringify(selection), alignment)) refreshDocument(selection);
  }

  function selectCanvasPoint(clientX: number, clientY: number, additive: boolean) {
    if (canvasToolRef.current !== "select") return;
    const renderer = rendererRef.current;
    const engine = engineRef.current;
    if (!renderer || !engine) return;
    const world = renderer.worldPointFromClient(clientX, clientY);
    const hitId = Number(engine.hit_test(world.x, world.y));
    if (hitId === 0) {
      if (!additive) applySelection([]);
      return;
    }
    const model = JSON.parse(engine.read_model_json()) as DocumentReadModel;
    const selectedAncestor = findSelectedAncestor(hitId, selectedNodeIdsRef.current, model.nodes);
    selectNode(selectedAncestor ?? hitId, additive);
  }

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let disposed = false;
    let localEngine: DocumentEngine | undefined;
    let localRenderer: OpenLibraRenderer | undefined;

    async function start() {
      if (!navigator.gpu) {
        throw new Error("Open Libra currently requires WebGPU in a current desktop Chrome or Edge browser.");
      }
      await init();
      if (disposed) return;
      const startedAt = performance.now();
      const engine = new DocumentEngine();
      localEngine = engine;
      engineRef.current = engine;
      setDocumentModel(JSON.parse(engine.read_model_json()) as DocumentReadModel);
      const rectData = engine.scene_data();
      const sceneBuildMs = performance.now() - startedAt;

      const renderer = await OpenLibraRenderer.create(canvas!, rectData, sceneBuildMs, setStats, setError);
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
          const id = Number(engine.hit_test(x, y));
          return id === 0 ? undefined : id;
        },
        select: () => {},
        moveSelection: (dx, dy) => moveSelection(dx, dy),
        resizeSelection: (handle, dx, dy) => resizeSelection(handle, dx, dy),
        beginEdit: () => engine.begin_transaction(),
        endEdit: () => { engine.reparent_nodes_to_artboards(JSON.stringify(selectedNodeIdsRef.current)); engine.end_transaction(); refreshDocument(); },
      });
      renderer.start();
    }

    start().catch((cause: unknown) => setError(cause instanceof Error ? cause.message : String(cause)));
    return () => {
      disposed = true;
      localRenderer?.dispose();
      localEngine?.free();
      if (rendererRef.current === localRenderer) rendererRef.current = undefined;
      if (engineRef.current === localEngine) engineRef.current = undefined;
    };
  }, []);

  useEffect(() => {
    if (!editMenuOpen) return;
    function closeEditMenu(event: PointerEvent) {
      if (event.target instanceof Node && editMenuRef.current?.contains(event.target)) return;
      setEditMenuOpen(false);
    }
    document.addEventListener("pointerdown", closeEditMenu, true);
    return () => document.removeEventListener("pointerdown", closeEditMenu, true);
  }, [editMenuOpen]);

  useEffect(() => {
    if (!viewMenuOpen) return;
    function closeViewMenu(event: PointerEvent) {
      if (event.target instanceof Node && viewMenuRef.current?.contains(event.target)) return;
      setViewMenuOpen(false);
    }
    document.addEventListener("pointerdown", closeViewMenu, true);
    return () => document.removeEventListener("pointerdown", closeViewMenu, true);
  }, [viewMenuOpen]);

  useEffect(() => localStorage.setItem("open-libra-rulers", rulersVisible ? "visible" : "hidden"), [rulersVisible]);

  useEffect(() => {
    function handleShortcut(event: KeyboardEvent) {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
      if (event.key === "1") setMode("design");
      if (event.key === "2") setMode("developer");
      if (event.key === "3") setMode("review");
      if (event.key === "+" || event.key === "=") rendererRef.current?.zoomBy(1.2);
      if (event.key === "-") rendererRef.current?.zoomBy(1 / 1.2);
      if (event.key === "0") rendererRef.current?.resetView();
      if (event.key.toLowerCase() === "f") rendererRef.current?.zoomToFit();
      if (event.shiftKey && event.key.toLowerCase() === "r") {
        event.preventDefault();
        setRulersVisible((visible) => !visible);
      }
      if (event.key === "Delete" || event.key === "Backspace") deleteSelected();
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (event.shiftKey) redo(); else undo();
      }
      const distance = event.shiftKey ? 10 : 1;
      if (event.key === "ArrowLeft") { event.preventDefault(); moveSelection(-distance, 0); }
      if (event.key === "ArrowRight") { event.preventDefault(); moveSelection(distance, 0); }
      if (event.key === "ArrowUp") { event.preventDefault(); moveSelection(0, -distance); }
      if (event.key === "ArrowDown") { event.preventDefault(); moveSelection(0, distance); }
    }
    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  });

  useEffect(() => {
    rendererRef.current?.setTool(canvasTool);
  }, [canvasTool]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("open-libra-theme", theme);
    rendererRef.current?.setTheme(theme);
  }, [theme]);

  useEffect(() => {
    function handleToolKeyDown(event: KeyboardEvent) {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
      if (event.key.toLowerCase() === "v") setCanvasTool("select");
      if (event.key.toLowerCase() === "h") setCanvasTool("hand");
      if (event.code === "Space" && !event.repeat) {
        event.preventDefault();
        toolBeforeSpaceRef.current = canvasToolRef.current;
        setCanvasTool("hand");
      }
    }
    function handleToolKeyUp(event: KeyboardEvent) {
      if (event.code === "Space" && toolBeforeSpaceRef.current) {
        setCanvasTool(toolBeforeSpaceRef.current);
        toolBeforeSpaceRef.current = undefined;
      }
    }
    window.addEventListener("keydown", handleToolKeyDown);
    window.addEventListener("keyup", handleToolKeyUp);
    return () => {
      window.removeEventListener("keydown", handleToolKeyDown);
      window.removeEventListener("keyup", handleToolKeyUp);
    };
  }, []);

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand"><span className="mark">OL</span><strong>Open Libra</strong><span className="file-name">Engine study</span><div className="menu-anchor" ref={editMenuRef}><button className={`menu-trigger ${editMenuOpen ? "active" : ""}`} onClick={() => { setViewMenuOpen(false); setEditMenuOpen((open) => !open); }}>Edit</button>{editMenuOpen && <div className="edit-menu" role="menu"><button role="menuitem" disabled={!historyState.canUndo} onClick={() => { undo(); setEditMenuOpen(false); }}><Undo2 /><span>Undo</span><kbd>⌘Z</kbd></button><button role="menuitem" disabled={!historyState.canRedo} onClick={() => { redo(); setEditMenuOpen(false); }}><Redo2 /><span>Redo</span><kbd>⇧⌘Z</kbd></button></div>}</div><div className="menu-anchor" ref={viewMenuRef}><button className={`menu-trigger ${viewMenuOpen ? "active" : ""}`} onClick={() => { setEditMenuOpen(false); setViewMenuOpen((open) => !open); }}>View</button>{viewMenuOpen && <div className="edit-menu view-menu" role="menu"><button role="menuitemcheckbox" aria-checked={rulersVisible} onClick={() => setRulersVisible((visible) => !visible)}><span className="menu-check">{rulersVisible ? "✓" : ""}</span><span>Show rulers</span><kbd>⇧R</kbd></button></div>}</div></div>
        <nav className="mode-switcher" aria-label="Editor mode">
          {MODES.map((item) => (
            <button key={item.id} className={mode === item.id ? "active" : ""} onClick={() => setMode(item.id)} title={`${item.label} mode (${item.shortcut})`}>
              {item.label}
            </button>
          ))}
        </nav>
        <div className="topbar-actions"><button className="theme-toggle" onClick={() => setTheme((current) => current === "dark" ? "light" : "dark")} aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`} title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}>{theme === "dark" ? <Sun /> : <Moon />}</button><button className="share-button">Share</button></div>
      </header>

      <section className="workspace">
        <aside className="left-panel">
          <Panel mode={mode} stats={stats} model={documentModel} selectedNodeIds={selectedNodeIds}
            onSelectNode={selectNode} onAddPage={addPage} onSelectPage={selectPage}
            onNavigateNode={(node) => rendererRef.current?.centerOnBounds(node)}
            onReorderNode={(draggedId, targetId, before) => {
              if (engineRef.current?.reorder_node(BigInt(draggedId), BigInt(targetId), before)) refreshDocument();
            }}
            onToggleLock={(id, locked) => {
              if (engineRef.current?.set_node_locked(BigInt(id), locked)) {
                if (locked && selectedNodeIdsRef.current.includes(id)) applySelection(selectedNodeIdsRef.current.filter((selected) => selected !== id));
                else refreshDocument();
              }
            }}
            onRenameNode={(id, name) => {
              if (name.trim() && engineRef.current?.rename_node(BigInt(id), name.trim())) refreshDocument();
            }} />
        </aside>

        <section className="stage">
          <div className="tool-rail" aria-label="Canvas tools">
            <ToolButton label="Select (V)" icon={<MousePointer2 />} active={canvasTool === "select"} disabled={mode !== "design"} onClick={() => setCanvasTool("select")} />
            <ToolButton label="Hand (H)" icon={<Hand />} active={canvasTool === "hand"} onClick={() => setCanvasTool("hand")} />
            <ToolButton label="Artboard" icon={<Frame />} disabled={mode !== "design"} active={artboardMenuOpen} onClick={() => setArtboardMenuOpen((open) => !open)} />
            <ToolButton label="Rectangle" icon={<Square />} disabled={mode !== "design"} onClick={() => addNode("rectangle")} />
            <ToolButton label="Text" icon={<Type />} disabled={mode !== "design"} />
            <ToolButton label="Comment" icon={<MessageCircle />} disabled={mode === "developer"} />
          </div>

          {artboardMenuOpen && <ArtboardMenu onChoose={addArtboard} onClose={() => setArtboardMenuOpen(false)} />}

          <div className="canvas-wrap">
            <canvas ref={canvasRef} aria-label="Open Libra WebGPU editor canvas"
              onPointerDownCapture={(event) => {
                if (event.button === 0 && !rendererRef.current?.resizeHandleFromClient(event.clientX, event.clientY)) selectCanvasPoint(event.clientX, event.clientY, event.shiftKey || event.metaKey || event.ctrlKey);
              }} />
            <ArtboardGuides rendererRef={rendererRef} nodes={documentModel.nodes} artboards={documentModel.nodes.filter((node) => node.kind === "frame" && node.guide_mode !== "none")} />
            <SelectionOverlay rendererRef={rendererRef} selected={documentModel.nodes.filter((node) => selectedNodeIds.includes(node.id))} />
            {editingText && (
              <input className="text-spike" defaultValue="Edit in the DOM, render in the engine" autoFocus
                onBlur={() => setEditingText(false)} onKeyDown={(event) => event.key === "Escape" && setEditingText(false)}
                aria-label="Text editing boundary experiment" />
            )}
            {error && <div className="error-card"><strong>Renderer unavailable</strong><span>{error}</span></div>}
          </div>

          {rulersVisible && <Rulers rendererRef={rendererRef} theme={theme} />}

          <div className="zoom-controls">
            <button onClick={() => rendererRef.current?.zoomBy(1 / 1.2)} aria-label="Zoom out">−</button>
            <button onClick={() => rendererRef.current?.resetView()}>{Math.round(stats.zoom * 100)}%</button>
            <button onClick={() => rendererRef.current?.zoomBy(1.2)} aria-label="Zoom in">+</button>
            <button onClick={() => rendererRef.current?.zoomToFit()} title="Zoom to fit (F)">Fit</button>
          </div>
        </section>

        <aside className="right-panel">
          <p className="eyebrow">{mode}</p>
          {mode === "design" && <Properties selected={documentModel.nodes.filter((node) => selectedNodeIds.includes(node.id))} documentColors={collectDocumentColors(documentModel)} onAddDocumentColor={addDocumentColor} onAlign={alignSelected} onDelete={deleteSelected} onGroup={groupSelected} onStyleChange={updateNodeStyle} onBoundsChange={updateNodeBounds} onOpacityChange={updateNodeOpacity} onShadowsChange={updateNodeShadows} onTransformChange={updateNodeTransform} onLayoutChange={updateNodeLayout} onWidthSizingChange={updateNodeWidthSizing} onArtboardGuideChange={updateArtboardGuide} />}
          {mode === "developer" && <Inspect />}
          {mode === "review" && <Review />}
        </aside>
      </section>
    </main>
  );
}

function Panel({ mode, stats, model, selectedNodeIds, onSelectNode, onAddPage, onSelectPage, onNavigateNode, onReorderNode, onToggleLock, onRenameNode }: {
  mode: Mode; stats: RenderStats; model: DocumentReadModel; selectedNodeIds: number[];
  onSelectNode: (id: number, additive: boolean) => void; onAddPage: () => void; onSelectPage: (id: number) => void;
  onNavigateNode: (node: NodeSummary) => void;
  onReorderNode: (draggedId: number, targetId: number, before: boolean) => void;
  onToggleLock: (id: number, locked: boolean) => void;
  onRenameNode: (id: number, name: string) => void;
}) {
  const [editingNodeId, setEditingNodeId] = useState<number>();
  const [editingName, setEditingName] = useState("");
  const [draggedNodeId, setDraggedNodeId] = useState<number>();
  const [dropTarget, setDropTarget] = useState<{ id: number; before: boolean }>();
  const [collapsedNodeIds, setCollapsedNodeIds] = useState<Set<number>>(() => new Set());
  const renameStateRef = useRef<{ id: number; name: string; originalName: string } | undefined>(undefined);
  const renameCallbackRef = useRef(onRenameNode);
  renameCallbackRef.current = onRenameNode;
  const editingNode = editingNodeId === undefined ? undefined : model.nodes.find((node) => node.id === editingNodeId);
  renameStateRef.current = editingNode ? { id: editingNode.id, name: editingName, originalName: editingNode.name } : undefined;

  function beginRename(node: NodeSummary) {
    setEditingNodeId(node.id);
    setEditingName(node.name);
  }

  function commitRename(node: NodeSummary) {
    if (renameStateRef.current?.id !== node.id) return;
    renameStateRef.current = undefined;
    setEditingNodeId(undefined);
    if (editingName.trim() && editingName.trim() !== node.name) onRenameNode(node.id, editingName);
  }

  useEffect(() => {
    function saveOnOutsidePointer(event: PointerEvent) {
      const current = renameStateRef.current;
      if (!current) return;
      const target = event.target;
      if (target instanceof Element && target.closest(`[data-layer-editor="${current.id}"]`)) return;
      const name = current.name.trim();
      renameStateRef.current = undefined;
      setEditingNodeId(undefined);
      if (name && name !== current.originalName) renameCallbackRef.current(current.id, name);
    }

    document.addEventListener("pointerdown", saveOnOutsidePointer, true);
    return () => document.removeEventListener("pointerdown", saveOnOutsidePointer, true);
  }, []);

  function toggleCollapsed(id: number) {
    setCollapsedNodeIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function renderLayer(node: NodeSummary, depth: number): React.ReactNode {
    const children = model.nodes.filter((candidate) => candidate.parent_id === node.id);
    const canCollapse = children.length > 0 && (node.kind === "frame" || node.kind === "group");
    const collapsed = collapsedNodeIds.has(node.id);
    return <div className="layer-branch" key={node.id}>
      <div data-layer-editor={node.id}
        className={`layer-row ${selectedNodeIds.includes(node.id) ? "selected" : ""} ${node.locked ? "locked" : ""} ${dropTarget?.id === node.id ? (dropTarget.before ? "drop-before" : "drop-after") : ""}`}
        style={{ paddingLeft: 5 + depth * 14 }} draggable={!node.locked && editingNodeId !== node.id}
        onDragStart={(event) => { setDraggedNodeId(node.id); event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", String(node.id)); }}
        onDragOver={(event) => {
          event.preventDefault();
          event.dataTransfer.dropEffect = "move";
          const bounds = event.currentTarget.getBoundingClientRect();
          setDropTarget({ id: node.id, before: event.clientY < bounds.top + bounds.height / 2 });
        }}
        onDrop={(event) => {
          event.preventDefault();
          if (draggedNodeId !== undefined && draggedNodeId !== node.id && dropTarget) onReorderNode(draggedNodeId, node.id, dropTarget.before);
          setDraggedNodeId(undefined);
          setDropTarget(undefined);
        }}
        onDragEnd={() => { setDraggedNodeId(undefined); setDropTarget(undefined); }}>
        {canCollapse ? <button className={`layer-chevron ${collapsed ? "collapsed" : ""}`} aria-label={`${collapsed ? "Expand" : "Collapse"} ${node.name}`} onClick={(event) => { event.stopPropagation(); toggleCollapsed(node.id); }}>⌄</button> : <span className="layer-chevron-spacer" />}
        <div className="layer-main" role="button" tabIndex={0} onClick={(event) => onSelectNode(node.id, event.metaKey || event.ctrlKey || event.shiftKey)}
          onDoubleClick={() => { onSelectNode(node.id, false); onNavigateNode(node); }}
          onKeyDown={(event) => {
            if (event.key === "Enter" && editingNodeId !== node.id && !node.locked) beginRename(node);
            if (event.key === " ") onSelectNode(node.id, event.metaKey || event.ctrlKey || event.shiftKey);
          }}>
          <span>{node.kind === "frame" ? "▣" : node.kind === "group" ? "◇" : "□"}</span>
          {editingNodeId === node.id ? <input className="layer-name-input" value={editingName} autoFocus
            onClick={(event) => event.stopPropagation()} onDoubleClick={(event) => event.stopPropagation()}
            onChange={(event) => setEditingName(event.target.value)} onBlur={() => commitRename(node)}
            onKeyDown={(event) => {
              if (event.key === "Enter") commitRename(node);
              if (event.key === "Escape") { renameStateRef.current = undefined; setEditingNodeId(undefined); }
            }} /> : <span>{node.name}</span>}
        </div>
        {!node.locked && editingNodeId !== node.id && <button className="rename-layer" aria-label={`Rename ${node.name}`} title="Rename layer" onClick={(event) => { event.stopPropagation(); beginRename(node); }}>✎</button>}
        <button className={`lock-layer ${node.locked ? "active" : ""}`} aria-label={`${node.locked ? "Unlock" : "Lock"} ${node.name}`} title={node.locked ? "Unlock layer" : "Lock layer"} onClick={(event) => { event.stopPropagation(); onToggleLock(node.id, !node.locked); }}>{node.locked ? "🔒" : "🔓"}</button>
      </div>
      {!collapsed && children.map((child) => renderLayer(child, depth + 1))}
    </div>;
  }

  if (mode === "review") return <><h2>Review activity</h2><EmptyState text="Comments will appear here in Level 9." /></>;
  return <>
    <div className="panel-tabs"><button className="active">Layers</button><button>Assets</button></div>
    <div className="page-list">
      {model.pages.map((page) => <button key={page.id} className={`page-row ${page.id === model.active_page_id ? "active" : ""}`} onClick={() => onSelectPage(page.id)}><span>▾</span><strong>{page.name}</strong></button>)}
      <button className="add-page" onClick={onAddPage}>+ Add page</button>
    </div>
    <div className="layer-list">
      {model.nodes.filter((node) => node.parent_id === undefined || node.parent_id === null).map((node) => renderLayer(node, 0))}
      {model.nodes.length === 0 && <EmptyState text="This page is empty. Add a frame or rectangle." />}
    </div>
    <p className="eyebrow diagnostics-title">Diagnostics</p>
    <dl className="metrics">
      <Metric label="Objects" value={stats.objects.toLocaleString()} />
      <Metric label="FPS" value={stats.fps.toFixed(0)} />
      <Metric label="CPU frame" value={`${stats.frameMs.toFixed(2)} ms`} />
      <Metric label="Rust scene" value={`${stats.sceneBuildMs.toFixed(2)} ms`} />
      <Metric label="GPU upload" value={`${stats.uploadMs.toFixed(2)} ms`} />
    </dl>
  </>;
}

function Properties(props: { selected: NodeSummary[]; documentColors: string[]; onAddDocumentColor: (color: string) => void; onAlign: (alignment: string) => void; onDelete: () => void; onGroup: () => void; onStyleChange: (node: NodeSummary, change: Partial<{ fill: string; stroke: string; strokeWidth: number; cornerRadius: number }>) => void; onBoundsChange: (node: NodeSummary, change: Partial<{ x: number; y: number; width: number; height: number }>) => void; onOpacityChange: (node: NodeSummary, opacity: number) => void; onShadowsChange: (node: NodeSummary, shadows: ShadowSummary[]) => void; onTransformChange: (node: NodeSummary, change: Partial<Pick<NodeSummary, "rotation" | "flip_x" | "flip_y">>) => void; onLayoutChange: (node: NodeSummary, change: Partial<Pick<NodeSummary, "layout_mode" | "layout_align" | "layout_justify" | "layout_gap" | "layout_padding" | "auto_height">>) => void; onWidthSizingChange: (node: NodeSummary, sizing: NodeSummary["width_sizing"]) => void; onArtboardGuideChange: (node: NodeSummary, change: Partial<Pick<NodeSummary, "guide_mode" | "guide_count" | "guide_gap" | "guide_color" | "guide_opacity">>) => void }) {
  const { selected } = props;
  if (selected.length === 0) return <><h2>Properties</h2><EmptyState text="Select a layer to inspect it." /></>;
  const node = selected[0];
  return <><h2>Properties</h2><div className="property-groups"><PropertySection title="Layer"><Property label="Name" value={selected.length === 1 ? node.name : `${selected.length} layers`} />{selected.length === 1 && <Property label="Type" value={node.kind} />}{selected.length > 1 && <button className="primary-button" onClick={props.onGroup}>Group selection</button>}</PropertySection>{selected.length > 1 && <PropertySection title="Alignment"><AlignmentControls onAlign={props.onAlign} /></PropertySection>}{selected.length === 1 && <><PropertySection title="Layout"><GeometryControls node={node} onChange={(change) => props.onBoundsChange(node, change)} onTransformChange={(change) => props.onTransformChange(node, change)} />{node.parent_id && <WidthSizingControl node={node} onChange={(sizing) => props.onWidthSizingChange(node, sizing)} />}</PropertySection>{(node.kind === "frame" || node.kind === "group") && <PropertySection title="Auto layout"><AutoLayoutControls node={node} onChange={(change) => props.onLayoutChange(node, change)} /></PropertySection>}{node.kind === "frame" && <PropertySection title="Artboard grid"><ArtboardGuideControls node={node} documentColors={props.documentColors} onAddDocumentColor={props.onAddDocumentColor} onChange={(change) => props.onArtboardGuideChange(node, change)} /></PropertySection>}{node.kind !== "group" && <StyleControls node={node} documentColors={props.documentColors} onAddDocumentColor={props.onAddDocumentColor} onChange={(change) => props.onStyleChange(node, change)} onOpacityChange={(opacity) => props.onOpacityChange(node, opacity)} onShadowsChange={(shadows) => props.onShadowsChange(node, shadows)} />}</>}<PropertySection title="Actions"><button className="danger-button" onClick={props.onDelete}>Delete {selected.length > 1 ? "layers" : "layer"}</button></PropertySection><EmptyState text="Drag on the canvas or use arrow keys to move. Hold Shift with arrows for 10 px." /></div></>;
}

function AlignmentControls({ onAlign }: { onAlign: (alignment: string) => void }) { const actions = [["left", <AlignHorizontalJustifyStart />], ["center-x", <AlignHorizontalJustifyCenter />], ["right", <AlignHorizontalJustifyEnd />], ["top", <AlignVerticalJustifyStart />], ["center-y", <AlignVerticalJustifyCenter />], ["bottom", <AlignVerticalJustifyEnd />]] as const; return <div className="alignment-controls">{actions.map(([id, icon]) => <button key={id} onClick={() => onAlign(id)} title={`Align ${id}`}>{icon}</button>)}</div>; }
function Inspect() { return <><h2>Inspect</h2><div className="code-block">display: block;<br />width: 58px;<br />height: 42px;</div><button className="secondary-button">Copy CSS</button><EmptyState text="Token and layout inspection arrives in Levels 6 and 9." /></>; }
function Review() { return <><h2>Comments</h2><button className="primary-button">Place comment</button><EmptyState text="Anchored collaborative threads arrive in Level 9." /></>; }
function Property({ label, value }: { label: string; value: string }) { return <div className="property"><span>{label}</span><strong>{value}</strong></div>; }
function EmptyState({ text }: { text: string }) { return <p className="empty-state">{text}</p>; }
function ToolButton({ label, icon, active, disabled, onClick }: { label: string; icon: React.ReactNode; active?: boolean; disabled?: boolean; onClick?: () => void }) { return <button className={active ? "active" : ""} disabled={disabled} title={label} aria-label={label} onClick={onClick}>{icon}</button>; }
function Metric({ label, value }: { label: string; value: string }) { return <div><dt>{label}</dt><dd>{value}</dd></div>; }

function Rulers({ rendererRef, theme }: { rendererRef: React.RefObject<OpenLibraRenderer | undefined>; theme: ColorTheme }) {
  const horizontalRef = useRef<HTMLCanvasElement>(null);
  const verticalRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let frame = 0;
    function draw() {
      const renderer = rendererRef.current;
      const horizontal = horizontalRef.current;
      const vertical = verticalRef.current;
      if (renderer && horizontal && vertical) drawRulers(horizontal, vertical, renderer.getViewState(), theme);
      frame = requestAnimationFrame(draw);
    }
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [rendererRef, theme]);
  return <div className="rulers" aria-hidden="true"><canvas className="horizontal-ruler" ref={horizontalRef} /><canvas className="vertical-ruler" ref={verticalRef} /><span className="ruler-corner" /></div>;
}

function SelectionOverlay({ rendererRef, selected }: { rendererRef: React.RefObject<OpenLibraRenderer | undefined>; selected: NodeSummary[] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let frame = 0;
    const draw = () => {
      const canvas = canvasRef.current;
      const renderer = rendererRef.current;
      if (canvas && renderer) drawSelectionOverlay(canvas, renderer.getViewState(), selected);
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [rendererRef, selected]);
  return <canvas ref={canvasRef} className="selection-overlay" aria-hidden="true" />;
}

function ArtboardGuides({ rendererRef, artboards, nodes }: { rendererRef: React.RefObject<OpenLibraRenderer | undefined>; artboards: NodeSummary[]; nodes: NodeSummary[] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let frame = 0;
    const draw = () => { const canvas = canvasRef.current; const renderer = rendererRef.current; if (canvas && renderer) drawArtboardGuides(canvas, renderer.getViewState(), artboards, nodes); frame = requestAnimationFrame(draw); };
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [rendererRef, artboards, nodes]);
  return <canvas ref={canvasRef} className="artboard-guides" aria-hidden="true" />;
}

function drawArtboardGuides(canvas: HTMLCanvasElement, view: { pan: { x: number; y: number }; zoom: number }, artboards: NodeSummary[], nodes: NodeSummary[]) {
  const width = canvas.clientWidth, height = canvas.clientHeight, ratio = devicePixelRatio;
  if (canvas.width !== Math.floor(width * ratio) || canvas.height !== Math.floor(height * ratio)) { canvas.width = Math.floor(width * ratio); canvas.height = Math.floor(height * ratio); }
  const context = canvas.getContext("2d"); if (!context) return;
  context.setTransform(ratio, 0, 0, ratio, 0, 0); context.clearRect(0, 0, width, height);
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  for (const node of artboards) {
    const artboardWidth = node.width * view.zoom, artboardHeight = node.height * view.zoom;
    const centerX = (node.x + node.width / 2) * view.zoom + view.pan.x, centerY = (node.y + node.height / 2) * view.zoom + view.pan.y;
    const color = rgbaToHex(node.guide_color); const alpha = node.guide_opacity;
    context.save(); context.translate(centerX, centerY); context.rotate(node.rotation * Math.PI / 180); context.beginPath(); context.rect(-artboardWidth / 2, -artboardHeight / 2, artboardWidth, artboardHeight); context.clip();
    if (node.guide_mode === "columns") {
      const count = Math.max(1, node.guide_count), gutter = node.guide_gap * view.zoom;
      const columnWidth = Math.max(0, (artboardWidth - gutter * (count - 1)) / count);
      context.fillStyle = hexWithAlpha(color, alpha);
      for (let index = 0; index < count; index++) context.fillRect(-artboardWidth / 2 + index * (columnWidth + gutter), -artboardHeight / 2, columnWidth, artboardHeight);
    } else {
      const spacing = Math.max(2, node.guide_gap * view.zoom);
      context.strokeStyle = hexWithAlpha(color, alpha); context.lineWidth = 1;
      context.beginPath();
      for (let x = -artboardWidth / 2; x <= artboardWidth / 2; x += spacing) { context.moveTo(x, -artboardHeight / 2); context.lineTo(x, artboardHeight / 2); }
      for (let y = -artboardHeight / 2; y <= artboardHeight / 2; y += spacing) { context.moveTo(-artboardWidth / 2, y); context.lineTo(artboardWidth / 2, y); }
      context.stroke();
    }
    context.restore();
    const descendants = nodes.filter((candidate) => candidate.id !== node.id && isDescendantOf(candidate, node.id, nodeById) && candidate.kind !== "group" && candidate.fill[3] * candidate.opacity > 0);
    context.save(); context.globalCompositeOperation = "destination-out"; context.fillStyle = "#000000";
    for (const child of descendants) {
      const childWidth = child.width * view.zoom, childHeight = child.height * view.zoom;
      const childCenterX = (child.x + child.width / 2) * view.zoom + view.pan.x, childCenterY = (child.y + child.height / 2) * view.zoom + view.pan.y;
      context.save(); context.translate(childCenterX, childCenterY); context.rotate(child.rotation * Math.PI / 180); context.globalAlpha = Math.min(1, child.fill[3] * child.opacity); context.beginPath(); context.roundRect(-childWidth / 2, -childHeight / 2, childWidth, childHeight, Math.min(child.corner_radius * view.zoom, childWidth / 2, childHeight / 2)); context.fill(); context.restore();
    }
    context.restore();
  }
}

function isDescendantOf(node: NodeSummary, ancestorId: number, byId: Map<number, NodeSummary>) {
  let parentId = node.parent_id;
  while (parentId != null) {
    if (parentId === ancestorId) return true;
    parentId = byId.get(parentId)?.parent_id;
  }
  return false;
}

function drawSelectionOverlay(canvas: HTMLCanvasElement, view: { pan: { x: number; y: number }; zoom: number }, selected: NodeSummary[]) {
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  const ratio = devicePixelRatio;
  const pixelWidth = Math.max(1, Math.floor(width * ratio));
  const pixelHeight = Math.max(1, Math.floor(height * ratio));
  if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) { canvas.width = pixelWidth; canvas.height = pixelHeight; }
  const context = canvas.getContext("2d");
  if (!context) return;
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  context.clearRect(0, 0, width, height);
  if (selected.length === 0) return;
  const minX = Math.min(...selected.map((node) => node.x)) * view.zoom + view.pan.x;
  const minY = Math.min(...selected.map((node) => node.y)) * view.zoom + view.pan.y;
  const maxX = Math.max(...selected.map((node) => node.x + node.width)) * view.zoom + view.pan.x;
  const maxY = Math.max(...selected.map((node) => node.y + node.height)) * view.zoom + view.pan.y;
  const angle = selected.length === 1 ? selected[0].rotation * Math.PI / 180 : 0;
  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;
  const rotate = ([x, y]: number[]) => [centerX + (x - centerX) * Math.cos(angle) - (y - centerY) * Math.sin(angle), centerY + (x - centerX) * Math.sin(angle) + (y - centerY) * Math.cos(angle)];
  context.strokeStyle = "#34f2ad";
  context.lineWidth = 2;
  const corners = [[minX, minY], [maxX, minY], [maxX, maxY], [minX, maxY]].map(rotate);
  context.beginPath(); context.moveTo(corners[0][0], corners[0][1]); for (const point of corners.slice(1)) context.lineTo(point[0], point[1]); context.closePath(); context.stroke();
  if (selected.length !== 1 || selected[0].kind === "group") return;
  const size = 8;
  const points = [[minX, minY], [(minX + maxX) / 2, minY], [maxX, minY], [maxX, (minY + maxY) / 2], [maxX, maxY], [(minX + maxX) / 2, maxY], [minX, maxY], [minX, (minY + maxY) / 2]].map(rotate);
  context.fillStyle = "#ffffff";
  for (const [x, y] of points) {
    context.fillRect(x - size / 2, y - size / 2, size, size);
    context.strokeRect(x - size / 2, y - size / 2, size, size);
  }
}

function drawRulers(horizontal: HTMLCanvasElement, vertical: HTMLCanvasElement, view: { pan: { x: number; y: number }; zoom: number }, theme: ColorTheme) {
  const stage = horizontal.parentElement?.parentElement;
  if (!stage) return;
  const width = stage.clientWidth;
  const height = stage.clientHeight;
  const ratio = devicePixelRatio;
  const setup = (canvas: HTMLCanvasElement, cssWidth: number, cssHeight: number) => {
    if (canvas.width !== cssWidth * ratio || canvas.height !== cssHeight * ratio) { canvas.width = cssWidth * ratio; canvas.height = cssHeight * ratio; }
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
  const firstX = Math.floor((-view.pan.x / view.zoom) / step) * step;
  const firstY = Math.floor((-view.pan.y / view.zoom) / step) * step;
  for (let world = firstX; world * view.zoom + view.pan.x < width; world += step) { const x = world * view.zoom + view.pan.x - 24; h.beginPath(); h.moveTo(x, 14); h.lineTo(x, 24); h.stroke(); h.fillText(String(world), x + 3, 10); }
  for (let world = firstY; world * view.zoom + view.pan.y < height; world += step) { const y = world * view.zoom + view.pan.y - 24; v.beginPath(); v.moveTo(14, y); v.lineTo(24, y); v.stroke(); v.save(); v.translate(10, y + 3); v.rotate(-Math.PI / 2); v.fillText(String(world), 0, 0); v.restore(); }
}

function StyleControls({ node, documentColors, onAddDocumentColor, onChange, onOpacityChange, onShadowsChange }: { node: NodeSummary; documentColors: string[]; onAddDocumentColor: (color: string) => void; onChange: (change: Partial<{ fill: string; stroke: string; strokeWidth: number; cornerRadius: number }>) => void; onOpacityChange: (opacity: number) => void; onShadowsChange: (shadows: ShadowSummary[]) => void }) {
  return <>
    <PropertySection title="Fill"><ColorControl label="Color" value={rgbaToHex(node.fill)} documentColors={documentColors} onAddDocumentColor={onAddDocumentColor} onChange={(fill) => onChange({ fill })} /></PropertySection>
    <PropertySection title="Border"><ColorControl label="Color" value={rgbaToHex(node.stroke)} documentColors={documentColors} onAddDocumentColor={onAddDocumentColor} onChange={(stroke) => onChange({ stroke })} /><NumberControl label="Width" value={node.stroke_width} max={20} onChange={(strokeWidth) => onChange({ strokeWidth })} /></PropertySection>
    <PropertySection title="Corners"><NumberControl label="Radius" value={node.corner_radius} max={Math.floor(Math.min(node.width, node.height) / 2)} onChange={(cornerRadius) => onChange({ cornerRadius })} /></PropertySection>
    <PropertySection title="Shadows"><ShadowControls shadows={node.shadows} documentColors={documentColors} onAddDocumentColor={onAddDocumentColor} onChange={onShadowsChange} /></PropertySection>
    <PropertySection title="Opacity"><NumberControl label="Opacity" value={Math.round(node.opacity * 100)} max={100} onChange={(opacity) => onOpacityChange(opacity / 100)} /></PropertySection>
  </>;
}

function ShadowControls({ shadows, documentColors, onAddDocumentColor, onChange }: { shadows: ShadowSummary[]; documentColors: string[]; onAddDocumentColor: (color: string) => void; onChange: (shadows: ShadowSummary[]) => void }) {
  const update = (index: number, change: Partial<ShadowSummary>) => onChange(shadows.map((shadow, position) => position === index ? { ...shadow, ...change } : shadow));
  const add = () => onChange([...shadows, { kind: "outer", color: [0, 0, 0, 0.25], offset_x: 0, offset_y: 8, blur: 16, spread: 0, enabled: true }]);
  return <div className="shadow-list">
    {shadows.map((shadow, index) => <div className="shadow-effect" key={index}>
      <div className="shadow-effect-header">
        <button className={`effect-toggle ${shadow.enabled ? "active" : ""}`} onClick={() => update(index, { enabled: !shadow.enabled })} title={shadow.enabled ? "Hide shadow" : "Show shadow"}>{shadow.enabled ? "●" : "○"}</button>
        <select value={shadow.kind} onChange={(event) => update(index, { kind: event.target.value as ShadowSummary["kind"] })}><option value="outer">Drop shadow</option><option value="inner">Inner shadow</option></select>
        <button onClick={() => onChange([...shadows.slice(0, index + 1), { ...shadow, color: [...shadow.color] }, ...shadows.slice(index + 1)])} title="Duplicate">＋</button>
        <button onClick={() => onChange(shadows.filter((_, position) => position !== index))} title="Remove">×</button>
      </div>
      <ColorControl label="Color" value={rgbaToHex(shadow.color)} documentColors={documentColors} onAddDocumentColor={onAddDocumentColor} onChange={(color) => update(index, { color: [...hexToRgb(color), shadow.color[3]] })} />
      <div className="geometry-grid shadow-grid">
        <GeometryInput label="X" value={shadow.offset_x} onChange={(offset_x) => update(index, { offset_x })} />
        <GeometryInput label="Y" value={shadow.offset_y} onChange={(offset_y) => update(index, { offset_y })} />
        <GeometryInput label="B" value={shadow.blur} min={0} onChange={(blur) => update(index, { blur })} />
        <GeometryInput label="S" value={shadow.spread} onChange={(spread) => update(index, { spread })} />
      </div>
      <NumberControl label="Opacity" value={Math.round(shadow.color[3] * 100)} max={100} onChange={(opacity) => update(index, { color: [shadow.color[0], shadow.color[1], shadow.color[2], opacity / 100] })} />
    </div>)}
    <button className="secondary-button add-shadow" onClick={add}>+ Add shadow</button>
  </div>;
}

function PropertySection({ title, children }: { title: string; children: React.ReactNode }) {
  return <details className="property-section" open><summary><span>{title}</span><span className="section-chevron">⌄</span></summary><div className="property-section-body">{children}</div></details>;
}

function GeometryControls({ node, onChange, onTransformChange }: { node: NodeSummary; onChange: (change: Partial<{ x: number; y: number; width: number; height: number }>) => void; onTransformChange: (change: Partial<Pick<NodeSummary, "rotation" | "flip_x" | "flip_y">>) => void }) {
  return <><div className="geometry-grid">
    <GeometryInput label="X" value={node.x} onChange={(x) => onChange({ x })} />
    <GeometryInput label="Y" value={node.y} onChange={(y) => onChange({ y })} />
    <GeometryInput label="W" value={node.width} min={8} onChange={(width) => onChange({ width })} />
    <GeometryInput label="H" value={node.height} min={8} onChange={(height) => onChange({ height })} />
  </div><div className="transform-controls"><label><span>°</span><input aria-label="Rotation degrees" type="number" value={Math.round(node.rotation * 100) / 100} onChange={(event) => onTransformChange({ rotation: Number(event.target.value) })} /></label><button title="Rotate 90° clockwise" onClick={() => onTransformChange({ rotation: node.rotation + 90 })}><RotateCw /></button><button title="Flip horizontally" aria-pressed={node.flip_x} onClick={() => onTransformChange({ flip_x: !node.flip_x })}><FlipHorizontal2 /></button><button title="Flip vertically" aria-pressed={node.flip_y} onClick={() => onTransformChange({ flip_y: !node.flip_y })}><FlipVertical2 /></button></div></>;
}

function AutoLayoutControls({ node, onChange }: { node: NodeSummary; onChange: (change: Partial<Pick<NodeSummary, "layout_mode" | "layout_align" | "layout_justify" | "layout_gap" | "layout_padding" | "auto_height">>) => void }) {
  const padding = node.layout_padding;
  const setPadding = (index: number, value: number) => onChange({
    layout_padding: padding.every((current) => current === 0) && value !== 0
      ? [value, value, value, value]
      : padding.map((current, position) => position === index ? value : current),
  });
  return <div className="auto-layout-controls">
    <div className="layout-direction" role="group" aria-label="Layout direction"><button className={node.layout_mode === "none" ? "active" : ""} onClick={() => onChange({ layout_mode: "none" })}>Off</button><button className={node.layout_mode === "row" ? "active" : ""} onClick={() => onChange({ layout_mode: "row" })}><Columns3 />Row</button><button className={node.layout_mode === "column" ? "active" : ""} onClick={() => onChange({ layout_mode: "column" })}><Rows3 />Column</button></div>
    {node.layout_mode !== "none" && <><div className="child-sizing auto-height"><span>Height</span><div><button className={!node.auto_height ? "active" : ""} onClick={() => onChange({ auto_height: false })}>Fixed</button><button className={node.auto_height ? "active" : ""} onClick={() => onChange({ auto_height: true })}>Auto</button></div></div><span className="layout-subheading">Alignment</span><AlignmentGrid node={node} onChange={onChange} /><LayoutNumberInput label="Gap" value={node.layout_gap} onChange={(layout_gap) => onChange({ layout_gap })} /><span className="layout-subheading">Padding</span><div className="geometry-grid padding-grid"><GeometryInput label="T" value={padding[0]} min={0} onChange={(value) => setPadding(0, value)} /><GeometryInput label="R" value={padding[1]} min={0} onChange={(value) => setPadding(1, value)} /><GeometryInput label="B" value={padding[2]} min={0} onChange={(value) => setPadding(2, value)} /><GeometryInput label="L" value={padding[3]} min={0} onChange={(value) => setPadding(3, value)} /></div></>}
  </div>;
}

function LayoutNumberInput({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return <label className="layout-number-input"><span>{label}</span><input type="number" min="0" step="1" value={Math.round(value * 100) / 100} onChange={(event) => { const next = Number(event.target.value); if (Number.isFinite(next)) onChange(Math.max(0, next)); }} /></label>;
}

function WidthSizingControl({ node, onChange }: { node: NodeSummary; onChange: (sizing: NodeSummary["width_sizing"]) => void }) {
  return <div className="child-sizing"><span>Width</span><div><button className={node.width_sizing === "fixed" ? "active" : ""} onClick={() => onChange("fixed")}>Fixed</button><button className={node.width_sizing === "fill" ? "active" : ""} onClick={() => onChange("fill")}>Fill</button></div></div>;
}

function ArtboardGuideControls({ node, documentColors, onAddDocumentColor, onChange }: { node: NodeSummary; documentColors: string[]; onAddDocumentColor: (color: string) => void; onChange: (change: Partial<Pick<NodeSummary, "guide_mode" | "guide_count" | "guide_gap" | "guide_color" | "guide_opacity">>) => void }) {
  return <div className="guide-controls"><div className="layout-direction"><button className={node.guide_mode === "none" ? "active" : ""} onClick={() => onChange({ guide_mode: "none" })}>Off</button><button className={node.guide_mode === "grid" ? "active" : ""} onClick={() => onChange({ guide_mode: "grid" })}>Grid</button><button className={node.guide_mode === "columns" ? "active" : ""} onClick={() => onChange({ guide_mode: "columns" })}>Columns</button></div>{node.guide_mode !== "none" && <>{node.guide_mode === "columns" && <LayoutNumberInput label="Columns" value={node.guide_count} onChange={(guide_count) => onChange({ guide_count: Math.max(1, Math.round(guide_count)) })} />}<LayoutNumberInput label={node.guide_mode === "grid" ? "Spacing" : "Gutter"} value={node.guide_gap} onChange={(guide_gap) => onChange({ guide_gap: Math.max(1, guide_gap) })} /><ColorControl label="Color" value={rgbaToHex(node.guide_color)} documentColors={documentColors} onAddDocumentColor={onAddDocumentColor} onChange={(color) => onChange({ guide_color: [...hexToRgb(color), 1] })} /><NumberControl label="Opacity" value={Math.round(node.guide_opacity * 100)} max={100} onChange={(opacity) => onChange({ guide_opacity: opacity / 100 })} /></>}</div>;
}

function AlignmentGrid({ node, onChange }: { node: NodeSummary; onChange: (change: Partial<Pick<NodeSummary, "layout_align" | "layout_justify">>) => void }) {
  const values = ["start", "center", "end"] as const;
  const horizontal = node.layout_mode === "row" ? node.layout_justify : node.layout_align;
  const vertical = node.layout_mode === "row" ? node.layout_align : node.layout_justify;
  return <div className="alignment-grid" role="group" aria-label="Content alignment">{values.flatMap((y) => values.map((x) => <button key={`${x}-${y}`} className={horizontal === x && vertical === y ? "active" : ""} title={`${y} ${x}`} aria-label={`Align ${y} ${x}`} onClick={() => onChange(node.layout_mode === "row" ? { layout_justify: x, layout_align: y } : { layout_align: x, layout_justify: y })}><span /></button>))}</div>;
}

function GeometryInput({ label, value, min, onChange }: { label: string; value: number; min?: number; onChange: (value: number) => void }) {
  return <label className="geometry-input"><span>{label}</span><input type="number" value={Math.round(value * 100) / 100} min={min} step="1" onChange={(event) => {
    const next = Number(event.target.value);
    if (Number.isFinite(next)) onChange(min === undefined ? next : Math.max(min, next));
  }} /></label>;
}

function ColorControl({ label, value, documentColors, onAddDocumentColor, onChange }: { label: string; value: string; documentColors: string[]; onAddDocumentColor: (color: string) => void; onChange: (value: string) => void }) {
  const [draft, setDraft] = useState(value);
  const [open, setOpen] = useState(false);
  const [recentColors, setRecentColors] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem("open-libra-recent-colors") ?? "[]") as string[]; } catch { return []; }
  });
  const [vaultColors, setVaultColors] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem("open-libra-vault-colors") ?? "[]") as string[]; } catch { return []; }
  });
  const pickerRef = useRef<HTMLLabelElement>(null);
  useEffect(() => setDraft(value), [value]);
  useEffect(() => {
    if (!open) return;
    function closeOnOutsidePointer(event: PointerEvent) {
      if (event.target instanceof Node && pickerRef.current?.contains(event.target)) return;
      setOpen(false);
    }
    document.addEventListener("pointerdown", closeOnOutsidePointer, true);
    return () => document.removeEventListener("pointerdown", closeOnOutsidePointer, true);
  }, [open]);

  function choose(color: string) {
    const normalized = color.toUpperCase();
    onChange(normalized);
    setDraft(normalized);
    setRecentColors((current) => {
      const next = [normalized, ...current.filter((item) => item !== normalized)].slice(0, 8);
      localStorage.setItem("open-libra-recent-colors", JSON.stringify(next));
      return next;
    });
    setOpen(false);
  }
  function addToVault() {
    setVaultColors((current) => {
      const normalized = value.toUpperCase();
      const next = [normalized, ...current.filter((item) => item !== normalized)];
      localStorage.setItem("open-libra-vault-colors", JSON.stringify(next));
      return next;
    });
  }
  function commit() {
    const normalized = draft.startsWith("#") ? draft : `#${draft}`;
    if (/^#[0-9a-f]{6}$/i.test(normalized)) choose(normalized);
    else setDraft(value);
  }
  return <label className="color-control" ref={pickerRef}><span>{label}</span><button type="button" className="color-swatch-button" onClick={() => setOpen((current) => !current)} aria-label={`Choose ${label.toLowerCase()} color`} aria-expanded={open}><span style={{ background: value }} /></button><input className="hex-input" value={draft} onChange={(event) => setDraft(event.target.value)} onBlur={commit} onKeyDown={(event) => event.key === "Enter" && commit()} />
    {open && <div className="color-library" role="dialog" aria-label={`${label} color library`}>
      {recentColors.length > 0 && <ColorPalette name="Recent" colors={recentColors} value={value} onChoose={choose} />}
      <ColorPalette name="Document" colors={documentColors} value={value} onChoose={choose} />
      <ColorPalette name="Vault" colors={vaultColors} value={value} onChoose={choose} />
      <div className="library-actions"><button type="button" onClick={() => onAddDocumentColor(value)}>+ Add to document</button><button type="button" onClick={addToVault}>+ Add to vault</button></div>
      <div className="custom-color-row"><span>Custom color</span><input type="color" value={value} onChange={(event) => choose(event.target.value)} /></div>
    </div>}
  </label>;
}

function ColorPalette({ name, colors, value, onChoose }: { name: string; colors: string[]; value: string; onChoose: (color: string) => void }) {
  return <section className="color-palette"><p>{name}</p>{colors.length > 0 ? <div>{colors.map((color) => <button type="button" key={color} className={color.toUpperCase() === value.toUpperCase() ? "selected" : ""} style={{ background: color }} onClick={() => onChoose(color)} aria-label={`${name} ${color}`} title={color} />)}</div> : <span className="empty-palette">No saved colors</span>}</section>;
}

function NumberControl({ label, value, max, onChange }: { label: string; value: number; max: number; onChange: (value: number) => void }) {
  return <label className="number-control"><span>{label}</span><input type="range" min="0" max={max} step="1" value={value} onChange={(event) => onChange(Number(event.target.value))} /><input type="number" min="0" max={max} value={Math.round(value)} onChange={(event) => onChange(Math.min(max, Math.max(0, Number(event.target.value))))} /></label>;
}

function ArtboardMenu({ onChoose, onClose }: { onChoose: (preset: (typeof ARTBOARD_PRESETS)[number]) => void; onClose: () => void }) {
  const categories = [...new Set(ARTBOARD_PRESETS.map((preset) => preset.category))];
  return <div className="artboard-menu" role="dialog" aria-label="Artboard presets">
    <div className="artboard-menu-header"><strong>New artboard</strong><button onClick={onClose} aria-label="Close">×</button></div>
    {categories.map((category) => <section key={category}><p>{category}</p>{ARTBOARD_PRESETS.filter((preset) => preset.category === category).map((preset) =>
      <button key={`${preset.name}-${preset.width}`} onClick={() => onChoose(preset)}><span>{preset.name}</span><small>{preset.width} × {preset.height}</small></button>)}</section>)}
  </div>;
}

function rgbaToHex(color: number[]) {
  return `#${color.slice(0, 3).map((channel) => Math.round(channel * 255).toString(16).padStart(2, "0")).join("")}`.toUpperCase();
}

function hexToRgb(hex: string) {
  const value = hex.replace("#", "");
  return [Number.parseInt(value.slice(0, 2), 16) / 255, Number.parseInt(value.slice(2, 4), 16) / 255, Number.parseInt(value.slice(4, 6), 16) / 255];
}

function hexWithAlpha(hex: string, alpha: number) {
  return `${hex}${Math.round(Math.min(1, Math.max(0, alpha)) * 255).toString(16).padStart(2, "0")}`;
}

function collectDocumentColors(model: DocumentReadModel) {
  const colors = new Set<string>();
  for (const color of model.document_colors) colors.add(color.value.toUpperCase());
  for (const node of model.nodes) {
    colors.add(rgbaToHex(node.fill));
    if (node.stroke_width > 0) colors.add(rgbaToHex(node.stroke));
  }
  return [...colors];
}

function preferredArtboardId(nodes: NodeSummary[], selectedIds: number[]) {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  let current = selectedIds.length === 1 ? byId.get(selectedIds[0]) : undefined;
  while (current) {
    if (current.kind === "frame" && current.parent_id == null) return current.id;
    current = current.parent_id == null ? undefined : byId.get(current.parent_id);
  }
  return [...nodes].reverse().find((node) => node.kind === "frame" && node.parent_id == null)?.id;
}

function findSelectedAncestor(id: number, selectedIds: number[], nodes: NodeSummary[]) {
  let current = nodes.find((node) => node.id === id);
  while (current?.parent_id !== undefined && current.parent_id !== null) {
    if (selectedIds.includes(current.parent_id)) return current.parent_id;
    current = nodes.find((node) => node.id === current?.parent_id);
  }
  return undefined;
}
