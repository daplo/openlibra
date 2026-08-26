import type { DragEvent, RefObject } from "react";
import {
  Check,
  ChevronRight,
  Component,
  Frame,
  Hand,
  MessageCircle,
  MousePointer2,
  Square,
  Shapes,
  Type,
} from "lucide-react";
import { ArtboardMenu } from "./ArtboardMenu";
import { ShapeMenu, type VectorShape } from "./ShapeMenu";
import { ToolButton } from "./EditorChrome";
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
} from "./CanvasOverlays";
import {
  VectorPointOverlay,
  type VectorPointSelection,
} from "./VectorPointOverlay";
import { textEditorStyle } from "../editor/app-utils";
import type {
  DocumentReadModel,
  Mode,
  NodeSummary,
  TextStyleSummary,
} from "../editor/types";
import type { CanvasTool, ColorTheme, OpenLibraRenderer } from "../renderer";
import type { ARTBOARD_PRESETS } from "../editor/constants";

type CanvasStageProps = {
  canvasRef: RefObject<HTMLCanvasElement | null>;
  rendererRef: RefObject<OpenLibraRenderer | undefined>;
  mode: Mode;
  rulersVisible: boolean;
  toolbarPosition: "top" | "bottom";
  canvasTool: CanvasTool;
  setCanvasTool: (tool: CanvasTool) => void;
  artboardMenuOpen: boolean;
  setArtboardMenuOpen: (open: boolean | ((value: boolean) => boolean)) => void;
  shapeMenuOpen: boolean;
  setShapeMenuOpen: (open: boolean | ((value: boolean) => boolean)) => void;
  addNode: (kind: "frame" | "rectangle" | "text") => void;
  addArtboard: (preset: (typeof ARTBOARD_PRESETS)[number]) => void;
  addVectorShape: (shape: VectorShape) => void;
  openCanvasComponentMenu: (x: number, y: number) => void;
  dropAssetOnCanvas: (
    event: DragEvent<HTMLCanvasElement>,
  ) => void | Promise<void>;
  gridVisible: boolean;
  theme: ColorTheme;
  documentModel: DocumentReadModel;
  guidedArtboards: NodeSummary[];
  editingVectorId?: string;
  selectedNodes: NodeSummary[];
  selectedVectorPoint?: VectorPointSelection;
  setSelectedVectorPoint: (selection: VectorPointSelection) => void;
  beginVectorPointMove: () => void;
  moveVectorPoint: (
    selection: VectorPointSelection,
    position: [number, number],
  ) => void;
  endVectorPointMove: () => void;
  deleteVectorPoint: (selection: VectorPointSelection) => void;
  editingTextId?: string;
  isolationRoot?: NodeSummary;
  componentWorkspace?: {
    component: { id: string; name: string };
    variant: { name: string };
  };
  marqueeRect?: { left: number; top: number; width: number; height: number };
  snapGuides: { x?: number; y?: number };
  openComponentLibrary: (componentId?: string) => void;
  exitIsolation: () => void;
  editingTextNode?: NodeSummary;
  editingTextInitialValue: string;
  updateNodeText: (node: NodeSummary, text: TextStyleSummary) => void;
  setEditingTextId: (id?: string) => void;
  error?: string;
  canvasContextMenu?: { x: number; y: number; sourceRootId: string };
  editMainComponent: (sourceRootId: string) => void;
  dismissCanvasContextMenu: () => void;
  zoom: number;
};

export function CanvasStage({
  canvasRef,
  rendererRef,
  mode,
  rulersVisible,
  toolbarPosition,
  canvasTool,
  setCanvasTool,
  artboardMenuOpen,
  setArtboardMenuOpen,
  shapeMenuOpen,
  setShapeMenuOpen,
  addNode,
  addArtboard,
  addVectorShape,
  openCanvasComponentMenu,
  dropAssetOnCanvas,
  gridVisible,
  theme,
  documentModel,
  guidedArtboards,
  editingVectorId,
  selectedNodes,
  selectedVectorPoint,
  setSelectedVectorPoint,
  beginVectorPointMove,
  moveVectorPoint,
  endVectorPointMove,
  deleteVectorPoint,
  editingTextId,
  isolationRoot,
  componentWorkspace,
  marqueeRect,
  snapGuides,
  openComponentLibrary,
  exitIsolation,
  editingTextNode,
  editingTextInitialValue,
  updateNodeText,
  setEditingTextId,
  error,
  canvasContextMenu,
  editMainComponent,
  dismissCanvasContextMenu,
  zoom,
}: CanvasStageProps) {
  return (
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
        {gridVisible && <CanvasGrid rendererRef={rendererRef} theme={theme} />}
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
        <VectorOverlay rendererRef={rendererRef} nodes={documentModel.nodes} />
        {editingVectorId &&
          selectedNodes.length === 1 &&
          selectedNodes[0].id === editingVectorId &&
          selectedNodes[0].vector?.geometry.type === "path" && (
            <VectorPointOverlay
              rendererRef={rendererRef}
              node={selectedNodes[0]}
              selectedPoint={selectedVectorPoint}
              onSelectPoint={setSelectedVectorPoint}
              onBeginMove={beginVectorPointMove}
              onMovePoint={moveVectorPoint}
              onEndMove={endVectorPointMove}
              onDeletePoint={deleteVectorPoint}
            />
          )}
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
        <SelectionOverlay rendererRef={rendererRef} selected={selectedNodes} />
        {marqueeRect && (
          <div className="selection-marquee" style={marqueeRect} />
        )}
        {snapGuides.x !== undefined && (
          <div className="snap-guide vertical" style={{ left: snapGuides.x }} />
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
              type="button"
              className="component-breadcrumb-link"
              onClick={() =>
                openComponentLibrary(componentWorkspace?.component.id)
              }
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
              type="button"
              className="component-workspace-done"
              onClick={exitIsolation}
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
            wrap={editingTextNode.text.sizing === "auto_width" ? "off" : "soft"}
            style={textEditorStyle(editingTextNode, rendererRef.current)}
            onBlur={(event) => {
              if (event.currentTarget.value !== editingTextInitialValue)
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
              type="button"
              role="menuitem"
              onPointerDown={(event) => event.stopPropagation()}
              onClick={() => {
                editMainComponent(canvasContextMenu.sourceRootId);
                dismissCanvasContextMenu();
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
          type="button"
          onClick={() => rendererRef.current?.zoomBy(1 / 1.2)}
          aria-label="Zoom out"
        >
          −
        </button>
        <button type="button" onClick={() => rendererRef.current?.resetView()}>
          {Math.round(zoom * 100)}%
        </button>
        <button
          type="button"
          onClick={() => rendererRef.current?.zoomBy(1.2)}
          aria-label="Zoom in"
        >
          +
        </button>
        <button
          type="button"
          onClick={() => rendererRef.current?.zoomToFit()}
          title="Zoom to fit (F)"
        >
          Fit
        </button>
      </div>
    </section>
  );
}
