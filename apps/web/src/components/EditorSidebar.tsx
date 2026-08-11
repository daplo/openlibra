import { useEffect, useMemo, useRef, useState } from "react";
import type { DocumentReadModel, Mode, NodeSummary } from "../editor/types";
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
  onNavigateNode,
  onReorderNode,
  onToggleLock,
  onRenameNode,
}: {
  mode: Mode;
  stats: RenderStats;
  model: DocumentReadModel;
  selectedNodeIds: number[];
  onSelectNode: (id: number, additive: boolean) => void;
  onAddPage: () => void;
  onSelectPage: (id: number) => void;
  onNavigateNode: (node: NodeSummary) => void;
  onReorderNode: (draggedId: number, targetId: number, before: boolean) => void;
  onToggleLock: (id: number, locked: boolean) => void;
  onRenameNode: (id: number, name: string) => void;
}) {
  const [editingNodeId, setEditingNodeId] = useState<number>();
  const [editingName, setEditingName] = useState("");
  const [draggedNodeId, setDraggedNodeId] = useState<number>();
  const [dropTarget, setDropTarget] = useState<{
    id: number;
    before: boolean;
  }>();
  const [collapsedNodeIds, setCollapsedNodeIds] = useState<Set<number>>(
    () => new Set(),
  );
  const renameStateRef = useRef<
    { id: number; name: string; originalName: string } | undefined
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
    const index = new Map<number | null, NodeSummary[]>();
    const modelOrder = new Map<number, number>();
    for (const [nodeIndex, node] of model.nodes.entries()) {
      modelOrder.set(node.id, nodeIndex);
      const parentId = node.parent_id ?? null;
      const siblings = index.get(parentId) ?? [];
      siblings.push(node);
      index.set(parentId, siblings);
    }
    const roots = index.get(null) ?? [];
    const relocatedGroups = new Set<number>();
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

  function toggleCollapsed(id: number) {
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
          data-selected={selectedNodeIds.includes(node.id)}
          data-locked={node.locked}
          className={`layer-row ${selectedNodeIds.includes(node.id) ? "selected" : ""} ${node.locked ? "locked" : ""} ${dropTarget?.id === node.id ? (dropTarget.before ? "drop-before" : "drop-after") : ""}`}
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
            <span>
              {node.kind === "frame" ? "▣" : node.kind === "group" ? "◇" : "□"}
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
  return (
    <>
      <div className="panel-tabs">
        <button className="active">Layers</button>
        <button>Assets</button>
      </div>
      <div className="page-list">
        {model.pages.map((page) => (
          <button
            key={page.id}
            data-testid={`page-node-${page.id}`}
            data-page-id={page.id}
            data-active={page.id === model.active_page_id}
            className={`page-row ${page.id === model.active_page_id ? "active" : ""}`}
            onClick={() => onSelectPage(page.id)}
            title={page.description || page.name}
          >
            <span>▾</span>
            <span className="page-copy">
              <strong>{page.name}</strong>
              {page.description && <small>{page.description}</small>}
            </span>
          </button>
        ))}
        <button className="add-page" onClick={onAddPage}>
          + Add page
        </button>
      </div>
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
      <p className="eyebrow diagnostics-title">Diagnostics</p>
      <dl className="metrics">
        <Metric label="Objects" value={stats.objects.toLocaleString()} />
        <Metric label="Visible" value={stats.visibleObjects.toLocaleString()} />
        <Metric label="FPS" value={stats.fps.toFixed(0)} />
        <Metric label="CPU frame" value={`${stats.frameMs.toFixed(2)} ms`} />
        <Metric
          label="Rust scene"
          value={`${stats.sceneBuildMs.toFixed(2)} ms`}
        />
        <Metric label="GPU upload" value={`${stats.uploadMs.toFixed(2)} ms`} />
      </dl>
    </>
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
