import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import type { ARTBOARD_PRESETS } from "./constants";
import { preferredArtboardId } from "./model-utils";
import type { DocumentReadModel, NodeSummary } from "./types";
import { useEditorInfrastructure } from "./EditorContext";

export function useNodeCommands({
  documentModel,
  selectedNodeIds,
  selectedComponentMaster,
  isolationRootId,
  refreshDocument,
  editingTextInitialValueRef,
  setEditingTextId,
  setArtboardMenuOpen,
  setError,
}: {
  documentModel: DocumentReadModel;
  selectedNodeIds: string[];
  selectedComponentMaster: boolean;
  isolationRootId?: string;
  refreshDocument: (selection?: string[]) => void;
  editingTextInitialValueRef: MutableRefObject<string>;
  setEditingTextId: Dispatch<SetStateAction<string | undefined>>;
  setArtboardMenuOpen: Dispatch<SetStateAction<boolean>>;
  setError: Dispatch<SetStateAction<string | undefined>>;
}) {
  const { engineRef, rendererRef, selectedNodeIdsRef, copiedNodeIdsRef } =
    useEditorInfrastructure();
  function selectionCanBeEdited() {
    return !selectedComponentMaster || Boolean(isolationRootId);
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

  return {
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
  };
}
