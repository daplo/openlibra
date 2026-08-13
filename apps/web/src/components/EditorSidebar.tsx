import { useEffect, useMemo, useRef, useState } from "react";
import {
  Boxes,
  Component,
  Copy,
  FileArchive,
  ImagePlus,
  Layers3,
  Plus,
  RefreshCw,
  Search,
  Trash2,
} from "lucide-react";
import { ICON_LIBRARY, type IconDefinition } from "../editor/icon-catalog";
import type {
  DocumentReadModel,
  Mode,
  NodeSummary,
  TextStyleAsset,
  TypographyStyle,
} from "../editor/types";
import type { RenderStats } from "../renderer";

const LAYER_DISPLAY_LIMIT = 100;

export function Panel({
  mode,
  stats,
  model,
  selectedNodeIds,
  onSelectNode,
  onAddPage,
  onSelectPage,
  onRenamePage,
  onDeletePage,
  onNavigateNode,
  onReorderNode,
  onToggleLock,
  onRenameNode,
  onAddNumberVariable,
  onUpdateNumberVariable,
  onDeleteNumberVariable,
  onAddTextStyle,
  onUpdateTextStyle,
  onDeleteTextStyle,
  hasSelectedText,
  onImportImage,
  onImportFigma,
  onAddLibraryIcon,
  onAddNodeFromAsset,
  onAddComponentInstance,
  onAddSelectedComponentVariant,
  onOpenComponentLibrary,
  componentWorkspace,
}: {
  mode: Mode;
  stats: RenderStats;
  model: DocumentReadModel;
  selectedNodeIds: string[];
  onSelectNode: (id: string, additive: boolean) => void;
  onAddPage: () => void;
  onSelectPage: (id: string) => void;
  onRenamePage: (id: string, name: string) => void;
  onDeletePage: (id: string) => void;
  onNavigateNode: (node: NodeSummary) => void;
  onReorderNode: (draggedId: string, targetId: string, before: boolean) => void;
  onToggleLock: (id: string, locked: boolean) => void;
  onRenameNode: (id: string, name: string) => void;
  onAddNumberVariable: (name: string, value: number) => void;
  onUpdateNumberVariable: (id: string, name: string, value: number) => void;
  onDeleteNumberVariable: (id: string) => void;
  onAddTextStyle: (name: string) => void;
  onUpdateTextStyle: (
    asset: TextStyleAsset,
    name: string,
    style?: TypographyStyle,
  ) => void;
  onDeleteTextStyle: (id: string) => void;
  hasSelectedText: boolean;
  onImportImage: (file: File) => void;
  onImportFigma: (file: File) => void;
  onAddLibraryIcon: (name: string, svg: string) => void;
  onAddNodeFromAsset: (assetId: string) => void;
  onAddComponentInstance: (componentId: string, variantId: string) => void;
  onAddSelectedComponentVariant: (componentId: string) => void;
  onOpenComponentLibrary: (componentId: string) => void;
  componentWorkspace?: { componentName: string; variantName: string };
}) {
  const [panelTab, setPanelTab] = useState<"layers" | "assets">("layers");
  const [editingNodeId, setEditingNodeId] = useState<string>();
  const [editingName, setEditingName] = useState("");
  const [editingPageId, setEditingPageId] = useState<string>();
  const [editingPageName, setEditingPageName] = useState("");
  const [draggedNodeId, setDraggedNodeId] = useState<string>();
  const [dropTarget, setDropTarget] = useState<{
    id: string;
    before: boolean;
  }>();
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    componentId: string;
  }>();
  const [collapsedNodeIds, setCollapsedNodeIds] = useState<Set<string>>(
    () => new Set(),
  );
  const renameStateRef = useRef<
    { id: string; name: string; originalName: string } | undefined
  >(undefined);
  const renameCallbackRef = useRef(onRenameNode);
  renameCallbackRef.current = onRenameNode;
  const editingNode =
    editingNodeId === undefined
      ? undefined
      : model.nodes.find((node) => node.id === editingNodeId);
  renameStateRef.current = editingNode
    ? { id: editingNode.id, name: editingName, originalName: editingNode.name }
    : undefined;
  const nodesByParent = useMemo(() => {
    const index = new Map<string | null, NodeSummary[]>();
    const modelOrder = new Map<string, number>();
    for (const [nodeIndex, node] of model.nodes.entries()) {
      modelOrder.set(node.id, nodeIndex);
      const parentId = node.parent_id ?? null;
      const siblings = index.get(parentId) ?? [];
      siblings.push(node);
      index.set(parentId, siblings);
    }
    const roots = index.get(null) ?? [];
    const relocatedGroups = new Set<string>();
    const groupsAtIndex = new Map<number, NodeSummary[]>();
    for (const group of roots) {
      if (group.kind !== "group") continue;
      const children = index.get(group.id) ?? [];
      const firstChildIndex = children.reduce(
        (first, child) => Math.min(first, modelOrder.get(child.id) ?? first),
        Number.POSITIVE_INFINITY,
      );
      if (!Number.isFinite(firstChildIndex)) continue;
      const groups = groupsAtIndex.get(firstChildIndex) ?? [];
      groups.push(group);
      groupsAtIndex.set(firstChildIndex, groups);
      relocatedGroups.add(group.id);
    }
    if (relocatedGroups.size > 0) {
      const orderedRoots: NodeSummary[] = [];
      for (const [nodeIndex, node] of model.nodes.entries()) {
        orderedRoots.push(...(groupsAtIndex.get(nodeIndex) ?? []));
        if (node.parent_id == null && !relocatedGroups.has(node.id))
          orderedRoots.push(node);
      }
      index.set(null, orderedRoots);
    }
    return index;
  }, [model.nodes]);
  const rootNodes = nodesByParent.get(null) ?? [];
  const visibleRootNodes = rootNodes.slice(0, LAYER_DISPLAY_LIMIT);

  function beginRename(node: NodeSummary) {
    setEditingNodeId(node.id);
    setEditingName(node.name);
  }

  function commitRename(node: NodeSummary) {
    if (renameStateRef.current?.id !== node.id) return;
    renameStateRef.current = undefined;
    setEditingNodeId(undefined);
    if (editingName.trim() && editingName.trim() !== node.name)
      onRenameNode(node.id, editingName);
  }

  useEffect(() => {
    function saveOnOutsidePointer(event: PointerEvent) {
      const current = renameStateRef.current;
      if (!current) return;
      const target = event.target;
      if (
        target instanceof Element &&
        target.closest(`[data-layer-editor="${current.id}"]`)
      )
        return;
      const name = current.name.trim();
      renameStateRef.current = undefined;
      setEditingNodeId(undefined);
      if (name && name !== current.originalName)
        renameCallbackRef.current(current.id, name);
    }

    document.addEventListener("pointerdown", saveOnOutsidePointer, true);
    return () =>
      document.removeEventListener("pointerdown", saveOnOutsidePointer, true);
  }, []);

  function toggleCollapsed(id: string) {
    setCollapsedNodeIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function renderLayer(node: NodeSummary, depth: number): React.ReactNode {
    const children = nodesByParent.get(node.id) ?? [];
    const canCollapse =
      children.length > 0 && (node.kind === "frame" || node.kind === "group");
    const collapsed = collapsedNodeIds.has(node.id);
    return (
      <div className="layer-branch" key={node.id}>
        <div
          data-layer-editor={node.id}
          data-testid={`layer-node-${node.id}`}
          data-node-id={node.id}
          data-node-kind={node.kind}
          data-component-id={node.component_id ?? ""}
          data-instance-root-id={node.instance_root_id ?? ""}
          data-selected={selectedNodeIds.includes(node.id)}
          data-locked={node.locked}
          className={`layer-row ${selectedNodeIds.includes(node.id) ? "selected" : ""} ${node.locked ? "locked" : ""} ${dropTarget?.id === node.id ? (dropTarget.before ? "drop-before" : "drop-after") : ""}`}
          onContextMenu={(event) => {
            const componentId = componentIdForNode(node, model.nodes);
            if (!componentId) return;
            event.preventDefault();
            setContextMenu({ x: event.clientX, y: event.clientY, componentId });
          }}
          style={{ paddingLeft: 5 + depth * 14 }}
          draggable={!node.locked && editingNodeId !== node.id}
          onDragStart={(event) => {
            setDraggedNodeId(node.id);
            event.dataTransfer.effectAllowed = "move";
            event.dataTransfer.setData("text/plain", String(node.id));
          }}
          onDragOver={(event) => {
            event.preventDefault();
            event.dataTransfer.dropEffect = "move";
            const bounds = event.currentTarget.getBoundingClientRect();
            setDropTarget({
              id: node.id,
              before: event.clientY < bounds.top + bounds.height / 2,
            });
          }}
          onDrop={(event) => {
            event.preventDefault();
            if (
              draggedNodeId !== undefined &&
              draggedNodeId !== node.id &&
              dropTarget
            )
              onReorderNode(draggedNodeId, node.id, dropTarget.before);
            setDraggedNodeId(undefined);
            setDropTarget(undefined);
          }}
          onDragEnd={() => {
            setDraggedNodeId(undefined);
            setDropTarget(undefined);
          }}
        >
          {canCollapse ? (
            <button
              className={`layer-chevron ${collapsed ? "collapsed" : ""}`}
              aria-label={`${collapsed ? "Expand" : "Collapse"} ${node.name}`}
              onClick={(event) => {
                event.stopPropagation();
                toggleCollapsed(node.id);
              }}
            >
              ⌄
            </button>
          ) : (
            <span className="layer-chevron-spacer" />
          )}
          <div
            className="layer-main"
            role="button"
            tabIndex={0}
            onClick={(event) =>
              onSelectNode(
                node.id,
                event.metaKey || event.ctrlKey || event.shiftKey,
              )
            }
            onDoubleClick={() => {
              onSelectNode(node.id, false);
              onNavigateNode(node);
            }}
            onKeyDown={(event) => {
              if (
                event.key === "Enter" &&
                editingNodeId !== node.id &&
                !node.locked
              )
                beginRename(node);
              if (event.key === " ")
                onSelectNode(
                  node.id,
                  event.metaKey || event.ctrlKey || event.shiftKey,
                );
            }}
          >
            <span className="layer-kind-icon">
              {node.component_id ? (
                node.instance_root_id === node.id ? (
                  <Copy aria-hidden="true" />
                ) : (
                  <Component aria-hidden="true" />
                )
              ) : node.kind === "frame" ? (
                "▣"
              ) : node.kind === "group" ? (
                "◇"
              ) : (
                "□"
              )}
            </span>
            {editingNodeId === node.id ? (
              <input
                className="layer-name-input"
                value={editingName}
                autoFocus
                onClick={(event) => event.stopPropagation()}
                onDoubleClick={(event) => event.stopPropagation()}
                onChange={(event) => setEditingName(event.target.value)}
                onBlur={() => commitRename(node)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") commitRename(node);
                  if (event.key === "Escape") {
                    renameStateRef.current = undefined;
                    setEditingNodeId(undefined);
                  }
                }}
              />
            ) : (
              <span>{node.name}</span>
            )}
          </div>
          {!node.locked && editingNodeId !== node.id && (
            <button
              className="rename-layer"
              aria-label={`Rename ${node.name}`}
              title="Rename layer"
              onClick={(event) => {
                event.stopPropagation();
                beginRename(node);
              }}
            >
              ✎
            </button>
          )}
          <button
            className={`lock-layer ${node.locked ? "active" : ""}`}
            aria-label={`${node.locked ? "Unlock" : "Lock"} ${node.name}`}
            title={node.locked ? "Unlock layer" : "Lock layer"}
            onClick={(event) => {
              event.stopPropagation();
              onToggleLock(node.id, !node.locked);
            }}
          >
            {node.locked ? "🔒" : "🔓"}
          </button>
        </div>
        {!collapsed && children.map((child) => renderLayer(child, depth + 1))}
      </div>
    );
  }

  if (mode === "review")
    return (
      <>
        <h2>Review activity</h2>
        <EmptyState text="Comments will appear here in Level 9." />
      </>
    );
  if (panelTab === "assets")
    return (
      <>
        <PanelTabs active={panelTab} onChange={setPanelTab} />
        <VaultPanel
          model={model}
          selectedNodeIds={selectedNodeIds}
          hasSelectedText={hasSelectedText}
          onAddNumberVariable={onAddNumberVariable}
          onUpdateNumberVariable={onUpdateNumberVariable}
          onDeleteNumberVariable={onDeleteNumberVariable}
          onAddTextStyle={onAddTextStyle}
          onUpdateTextStyle={onUpdateTextStyle}
          onDeleteTextStyle={onDeleteTextStyle}
          onImportImage={onImportImage}
          onImportFigma={onImportFigma}
          onAddLibraryIcon={onAddLibraryIcon}
          onAddNodeFromAsset={onAddNodeFromAsset}
          onAddComponentInstance={onAddComponentInstance}
          onAddSelectedComponentVariant={onAddSelectedComponentVariant}
        />
      </>
    );
  return (
    <>
      <PanelTabs active={panelTab} onChange={setPanelTab} />
      {componentWorkspace ? (
        <div
          className="component-tree-heading"
          data-testid="component-tree-heading"
        >
          <Component aria-hidden="true" />
          <span>
            <strong>{componentWorkspace.componentName}</strong>
            <small>{componentWorkspace.variantName}</small>
          </span>
        </div>
      ) : (
        <div className="page-list">
          {model.pages.map((page) => (
            <div
              key={page.id}
              data-testid={`page-node-${page.id}`}
              data-page-id={page.id}
              data-active={page.id === model.active_page_id}
              className={`page-row ${page.id === model.active_page_id ? "active" : ""}`}
              title={page.description || page.name}
            >
              <div
                className="page-main"
                role="button"
                tabIndex={0}
                onClick={() => onSelectPage(page.id)}
                onDoubleClick={() => {
                  setEditingPageId(page.id);
                  setEditingPageName(page.name);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ")
                    onSelectPage(page.id);
                }}
              >
                <span>▾</span>
                <span className="page-copy">
                  {editingPageId === page.id ? (
                    <input
                      className="layer-name-input"
                      value={editingPageName}
                      autoFocus
                      onClick={(event) => event.stopPropagation()}
                      onChange={(event) =>
                        setEditingPageName(event.target.value)
                      }
                      onBlur={() => {
                        onRenamePage(page.id, editingPageName);
                        setEditingPageId(undefined);
                      }}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") event.currentTarget.blur();
                        if (event.key === "Escape") {
                          setEditingPageName(page.name);
                          setEditingPageId(undefined);
                        }
                      }}
                    />
                  ) : (
                    <strong>{page.name}</strong>
                  )}
                  {page.description && <small>{page.description}</small>}
                </span>
              </div>
              {editingPageId !== page.id && (
                <>
                  <button
                    className="page-action"
                    aria-label={`Rename ${page.name}`}
                    title="Rename page"
                    onClick={() => {
                      setEditingPageId(page.id);
                      setEditingPageName(page.name);
                    }}
                  >
                    ✎
                  </button>
                  <button
                    className="page-action"
                    aria-label={`Delete ${page.name}`}
                    title="Delete page"
                    disabled={model.pages.length <= 1}
                    onClick={() => onDeletePage(page.id)}
                  >
                    <Trash2 aria-hidden="true" />
                  </button>
                </>
              )}
            </div>
          ))}
          <button className="add-page" onClick={onAddPage}>
            + Add page
          </button>
        </div>
      )}
      <div className="layer-list">
        {visibleRootNodes.map((node) => renderLayer(node, 0))}
        {rootNodes.length > LAYER_DISPLAY_LIMIT && (
          <EmptyState
            text={`Showing ${LAYER_DISPLAY_LIMIT.toLocaleString()} of ${rootNodes.length.toLocaleString()} top-level layers to keep the panel responsive.`}
          />
        )}
        {model.nodes.length === 0 && (
          <EmptyState text="This page is empty. Add a frame or rectangle." />
        )}
      </div>
      {contextMenu && (
        <div
          className="layer-context-menu"
          role="menu"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          <button
            role="menuitem"
            onClick={() => {
              onOpenComponentLibrary(contextMenu.componentId);
              setContextMenu(undefined);
            }}
          >
            <Component aria-hidden="true" />
            View in library
          </button>
        </div>
      )}
      {!componentWorkspace && (
        <>
          <p className="eyebrow diagnostics-title">Diagnostics</p>
          <dl className="metrics">
            <Metric label="Objects" value={stats.objects.toLocaleString()} />
            <Metric
              label="Visible"
              value={stats.visibleObjects.toLocaleString()}
            />
            <Metric label="FPS" value={stats.fps.toFixed(0)} />
            <Metric
              label="CPU frame"
              value={`${stats.frameMs.toFixed(2)} ms`}
            />
            <Metric
              label="Rust scene"
              value={`${stats.sceneBuildMs.toFixed(2)} ms`}
            />
            <Metric
              label="GPU upload"
              value={`${stats.uploadMs.toFixed(2)} ms`}
            />
          </dl>
        </>
      )}
    </>
  );
}

function componentIdForNode(node: NodeSummary, nodes: NodeSummary[]) {
  if (node.component_id) return node.component_id;
  if (!node.instance_root_id) return undefined;
  return nodes.find((item) => item.id === node.instance_root_id)?.component_id;
}

function PanelTabs({
  active,
  onChange,
}: {
  active: "layers" | "assets";
  onChange: (tab: "layers" | "assets") => void;
}) {
  return (
    <div className="panel-tabs">
      <button
        className={active === "layers" ? "active" : ""}
        onClick={() => onChange("layers")}
      >
        <Layers3 aria-hidden="true" />
        Layers
      </button>
      <button
        className={active === "assets" ? "active" : ""}
        onClick={() => onChange("assets")}
      >
        <Boxes aria-hidden="true" />
        Assets
      </button>
    </div>
  );
}

function VaultPanel({
  model,
  selectedNodeIds,
  hasSelectedText,
  onAddNumberVariable,
  onUpdateNumberVariable,
  onDeleteNumberVariable,
  onAddTextStyle,
  onUpdateTextStyle,
  onDeleteTextStyle,
  onImportImage,
  onImportFigma,
  onAddLibraryIcon,
  onAddNodeFromAsset,
  onAddComponentInstance,
  onAddSelectedComponentVariant,
}: {
  model: DocumentReadModel;
  selectedNodeIds: string[];
  hasSelectedText: boolean;
  onAddNumberVariable: (name: string, value: number) => void;
  onUpdateNumberVariable: (id: string, name: string, value: number) => void;
  onDeleteNumberVariable: (id: string) => void;
  onAddTextStyle: (name: string) => void;
  onUpdateTextStyle: (
    asset: TextStyleAsset,
    name: string,
    style?: TypographyStyle,
  ) => void;
  onDeleteTextStyle: (id: string) => void;
  onImportImage: (file: File) => void;
  onImportFigma: (file: File) => void;
  onAddLibraryIcon: (name: string, svg: string) => void;
  onAddNodeFromAsset: (assetId: string) => void;
  onAddComponentInstance: (componentId: string, variantId: string) => void;
  onAddSelectedComponentVariant: (componentId: string) => void;
}) {
  const [variableName, setVariableName] = useState("Spacing / 16");
  const [variableValue, setVariableValue] = useState("16");
  const [styleName, setStyleName] = useState("Body / Regular");
  const [iconQuery, setIconQuery] = useState("");
  const visibleIcons = ICON_LIBRARY.filter((icon) =>
    [icon.name, ...icon.tags].some((value) =>
      value.toLowerCase().includes(iconQuery.trim().toLowerCase()),
    ),
  );
  return (
    <div className="vault-panel" data-testid="document-vault">
      <div className="vault-heading">
        <div>
          <span className="eyebrow">Document vault</span>
          <h2>Assets &amp; tokens</h2>
        </div>
        <small>Saved with this document</small>
      </div>

      <section className="vault-section figma-import-section">
        <div>
          <h3>Figma file</h3>
          <small>
            Import editable pages, layers, text, and embedded images.
          </small>
        </div>
        <label className="figma-import-button" title="Import Figma file">
          <FileArchive aria-hidden="true" />
          <span>Import .fig</span>
          <input
            data-testid="figma-upload"
            type="file"
            accept=".fig,application/octet-stream"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) onImportFigma(file);
              event.currentTarget.value = "";
            }}
          />
        </label>
      </section>

      <section className="vault-section">
        <div className="vault-section-heading">
          <h3>Images</h3>
          <label
            className="asset-upload-button"
            aria-label="Import image"
            title="Import image"
          >
            <ImagePlus aria-hidden="true" />
            <input
              data-testid="image-upload"
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) onImportImage(file);
                event.currentTarget.value = "";
              }}
            />
          </label>
        </div>
        <div className="media-asset-grid">
          {model.media_assets
            .filter((asset) => asset.kind === "image")
            .map((asset) => (
              <button
                key={asset.id}
                className="media-asset-card"
                title={`Insert ${asset.name}`}
                draggable
                onDragStart={(event) => {
                  event.dataTransfer.effectAllowed = "copy";
                  event.dataTransfer.setData(
                    "application/x-open-libra-asset",
                    JSON.stringify({ kind: "asset", assetId: asset.id }),
                  );
                }}
                onClick={() => onAddNodeFromAsset(asset.id)}
              >
                <img src={asset.source} alt="" />
                <span>{asset.name}</span>
              </button>
            ))}
        </div>
        {!model.media_assets.some((asset) => asset.kind === "image") && (
          <p className="empty-state">Import a PNG, JPEG, or WebP.</p>
        )}
      </section>

      <section className="vault-section">
        <h3>Icon library</h3>
        <label className="icon-search">
          <Search aria-hidden="true" />
          <input
            aria-label="Search icons"
            placeholder="Search icons"
            value={iconQuery}
            onChange={(event) => setIconQuery(event.target.value)}
          />
        </label>
        <div className="icon-library-grid">
          {visibleIcons.map((icon) => (
            <IconLibraryButton
              key={icon.name}
              icon={icon}
              onClick={() => onAddLibraryIcon(icon.name, icon.svg)}
            />
          ))}
        </div>
      </section>

      <section className="vault-section">
        <h3>Components</h3>
        <div className="vault-list">
          {model.components.map((component) => (
            <div className="component-asset-card" key={component.id}>
              <strong>{component.name}</strong>
              <small>{component.variants.length} variant(s)</small>
              {component.variants.map((variant) => (
                <button
                  key={variant.id}
                  onClick={() =>
                    onAddComponentInstance(component.id, variant.id)
                  }
                >
                  Insert {variant.name}
                </button>
              ))}
              <button
                disabled={
                  !hasSelectedComponentCandidate(model, selectedNodeIds)
                }
                onClick={() => onAddSelectedComponentVariant(component.id)}
              >
                Add selection as variant
              </button>
            </div>
          ))}
          {model.components.length === 0 && (
            <p className="empty-state">No components yet.</p>
          )}
        </div>
      </section>

      <section className="vault-section">
        <h3>Variables</h3>
        <div className="vault-create-row">
          <input
            aria-label="New variable name"
            value={variableName}
            onChange={(event) => setVariableName(event.target.value)}
          />
          <input
            aria-label="New variable value"
            type="number"
            min="0"
            value={variableValue}
            onChange={(event) => setVariableValue(event.target.value)}
          />
          <button
            className="vault-icon-button"
            aria-label="Add variable"
            title="Add variable"
            onClick={() => {
              const value = Number(variableValue);
              if (Number.isFinite(value))
                onAddNumberVariable(variableName, value);
            }}
          >
            <Plus aria-hidden="true" />
          </button>
        </div>
        <div className="vault-list">
          {model.number_variables.map((variable) => (
            <div className="vault-token-row" key={variable.id}>
              <input
                aria-label={`${variable.name} name`}
                defaultValue={variable.name}
                onBlur={(event) =>
                  onUpdateNumberVariable(
                    variable.id,
                    event.currentTarget.value,
                    variable.value,
                  )
                }
              />
              <VaultNumberInput
                aria-label={`${variable.name} value`}
                value={variable.value}
                min={0}
                onCommit={(value) =>
                  onUpdateNumberVariable(variable.id, variable.name, value)
                }
              />
              <button
                className="vault-delete"
                aria-label={`Delete ${variable.name}`}
                onClick={() => onDeleteNumberVariable(variable.id)}
              >
                <Trash2 aria-hidden="true" />
              </button>
            </div>
          ))}
          {model.number_variables.length === 0 && (
            <p className="empty-state">No numeric variables yet.</p>
          )}
        </div>
      </section>

      <section className="vault-section">
        <h3>Text styles</h3>
        <div className="vault-create-row text-style-create">
          <input
            aria-label="New text style name"
            value={styleName}
            onChange={(event) => setStyleName(event.target.value)}
          />
          <button
            className="vault-icon-button"
            aria-label="Add from selection"
            disabled={!hasSelectedText}
            title={
              hasSelectedText
                ? "Create from selected text"
                : "Select a text layer first"
            }
            onClick={() => onAddTextStyle(styleName)}
          >
            <Plus aria-hidden="true" />
          </button>
        </div>
        <div className="vault-list">
          {model.text_styles.map((asset) => (
            <div className="vault-style-card" key={asset.id}>
              <div
                className="vault-style-preview"
                style={{
                  fontFamily: asset.style.font_family,
                  fontSize: Math.min(24, asset.style.font_size),
                  fontWeight: asset.style.font_weight,
                }}
              >
                Aa
              </div>
              <div className="vault-style-copy">
                <input
                  aria-label={`${asset.name} name`}
                  defaultValue={asset.name}
                  onBlur={(event) =>
                    onUpdateTextStyle(
                      asset,
                      event.currentTarget.value,
                      asset.style,
                    )
                  }
                />
                <small>{textStyleDetails(asset.style)}</small>
                <div className="vault-style-fields">
                  <input
                    aria-label={`${asset.name} font family`}
                    value={asset.style.font_family}
                    onChange={(event) =>
                      onUpdateTextStyle(asset, asset.name, {
                        ...asset.style,
                        font_family: event.target.value,
                      })
                    }
                  />
                  <VaultNumberInput
                    aria-label={`${asset.name} font size`}
                    value={asset.style.font_size}
                    min={1}
                    onCommit={(font_size) =>
                      onUpdateTextStyle(asset, asset.name, {
                        ...asset.style,
                        font_size,
                      })
                    }
                  />
                  <VaultNumberInput
                    aria-label={`${asset.name} font weight`}
                    value={asset.style.font_weight}
                    min={100}
                    max={900}
                    step={100}
                    onCommit={(font_weight) =>
                      onUpdateTextStyle(asset, asset.name, {
                        ...asset.style,
                        font_weight,
                      })
                    }
                  />
                </div>
                <button
                  className="vault-icon-button"
                  aria-label={`Update ${asset.name} from selection`}
                  title="Update from selection"
                  disabled={!hasSelectedText}
                  onClick={() => onUpdateTextStyle(asset, asset.name)}
                >
                  <RefreshCw aria-hidden="true" />
                </button>
              </div>
              <button
                className="vault-delete"
                aria-label={`Delete ${asset.name}`}
                onClick={() => onDeleteTextStyle(asset.id)}
              >
                <Trash2 aria-hidden="true" />
              </button>
            </div>
          ))}
          {model.text_styles.length === 0 && (
            <p className="empty-state">No text styles yet.</p>
          )}
        </div>
      </section>
    </div>
  );
}

function hasSelectedComponentCandidate(
  model: DocumentReadModel,
  selectedNodeIds: string[],
) {
  if (selectedNodeIds.length !== 1) return false;
  const node = model.nodes.find((item) => item.id === selectedNodeIds[0]);
  return Boolean(
    node && !node.component_id && !node.instance_root_id && !node.locked,
  );
}

function textStyleDetails(style: TypographyStyle) {
  const values: string[] = [];
  if (style.font_family !== "Arial") values.push(style.font_family);
  if (style.font_size !== 24) values.push(`${style.font_size}px`);
  if (style.font_weight !== 400) values.push(`Weight ${style.font_weight}`);
  if (style.line_height !== 1.2) values.push(`Line ${style.line_height}`);
  if (style.letter_spacing !== 0)
    values.push(`Spacing ${style.letter_spacing}`);
  if (style.font_style !== "normal") values.push(style.font_style);
  if (style.horizontal_align !== "left")
    values.push(`H ${style.horizontal_align}`);
  if (style.vertical_align !== "top") values.push(`V ${style.vertical_align}`);
  if (style.sizing !== "auto_width")
    values.push(style.sizing.replace("_", " "));
  return values.length > 0 ? values.join(" · ") : "Default typography";
}

function IconLibraryButton({
  icon,
  onClick,
}: {
  icon: IconDefinition;
  onClick: () => void;
}) {
  return (
    <button
      className="icon-library-button"
      data-testid={`icon-library-${icon.name}`}
      aria-label={`Insert ${icon.name}`}
      title={`Insert ${icon.name}`}
      draggable
      onDragStart={(event) => {
        event.dataTransfer.effectAllowed = "copy";
        event.dataTransfer.setData(
          "application/x-open-libra-asset",
          JSON.stringify({ kind: "icon", name: icon.name, svg: icon.svg }),
        );
      }}
      onClick={onClick}
    >
      <span dangerouslySetInnerHTML={{ __html: icon.svg }} />
    </button>
  );
}

function VaultNumberInput({
  value,
  min,
  max,
  step = 1,
  onCommit,
  ...props
}: {
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onCommit: (value: number) => void;
  "aria-label": string;
}) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  const commit = () => {
    const parsed = Number(draft);
    if (!Number.isFinite(parsed)) {
      setDraft(String(value));
      return;
    }
    onCommit(Math.min(max ?? Infinity, Math.max(min ?? -Infinity, parsed)));
  };
  return (
    <input
      {...props}
      type="number"
      min={min}
      max={max}
      step={step}
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === "Enter") event.currentTarget.blur();
      }}
    />
  );
}

function EmptyState({ text }: { text: string }) {
  return <p className="empty-state">{text}</p>;
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
