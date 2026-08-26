import { useEffect, useMemo, type Dispatch, type SetStateAction } from "react";
import {
  findComponentMasterRoot,
  isComponentMasterNode,
  isNodeWithinRoot,
} from "./app-utils";
import { collectDocumentColors } from "./model-utils";
import type { DocumentReadModel, NodeSummary } from "./types";
import { useEditorInfrastructure } from "./EditorContext";

export function useEditorSelection({
  documentModel,
  selectedNodeIds,
  isolationRootId,
  setIsolationRootId,
  editingTextId,
}: {
  documentModel: DocumentReadModel;
  selectedNodeIds: string[];
  isolationRootId?: string;
  setIsolationRootId: Dispatch<SetStateAction<string | undefined>>;
  editingTextId?: string;
}) {
  const { nodesByIdRef, documentModelRef, isolationRootIdRef } =
    useEditorInfrastructure();
  const nodesById = useMemo(
    () => new Map(documentModel.nodes.map((node) => [node.id, node])),
    [documentModel.nodes],
  );
  nodesByIdRef.current = nodesById;
  documentModelRef.current = documentModel;
  isolationRootIdRef.current = isolationRootId;

  const selectedNodes = useMemo(
    () =>
      selectedNodeIds
        .map((id) => nodesById.get(id))
        .filter((node): node is NodeSummary => node !== undefined),
    [nodesById, selectedNodeIds],
  );
  const activePage = documentModel.pages.find(
    (page) => page.id === documentModel.active_page_id,
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
  const componentWorkspace = (() => {
    if (!isolationRootId) return undefined;
    for (const component of documentModel.components) {
      const variant = component.variants.find(
        (item) => item.source_root_id === isolationRootId,
      );
      if (variant) return { component, variant };
    }
    return undefined;
  })();
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

  useEffect(() => {
    if (isolationRootId && !nodesById.has(isolationRootId))
      setIsolationRootId(undefined);
  }, [isolationRootId, nodesById, setIsolationRootId]);

  return {
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
  };
}
