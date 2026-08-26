import type { Dispatch, SetStateAction } from "react";
import type { VectorPointSelection } from "../components/VectorPointOverlay";
import type { VectorShape } from "../components/ShapeMenu";
import { exportVectorSvg } from "./export-vector";
import { preferredArtboardId } from "./model-utils";
import type { DocumentReadModel, NodeSummary } from "./types";
import { useEditorInfrastructure } from "./EditorContext";

export function useVectorCommands({
  selectedVectorPoint,
  setSelectedVectorPoint,
  editingVectorId,
  setEditingVectorId,
  documentModel,
  setShapeMenuOpen,
  setError,
  refreshDocument,
}: {
  selectedVectorPoint?: VectorPointSelection;
  setSelectedVectorPoint: Dispatch<
    SetStateAction<VectorPointSelection | undefined>
  >;
  editingVectorId?: string;
  setEditingVectorId: Dispatch<SetStateAction<string | undefined>>;
  documentModel: DocumentReadModel;
  setShapeMenuOpen: Dispatch<SetStateAction<boolean>>;
  setError: Dispatch<SetStateAction<string | undefined>>;
  refreshDocument: (selection?: string[]) => void;
}) {
  const { engineRef, selectedNodeIdsRef } = useEditorInfrastructure();
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

  function toggleVectorEditing(node: NodeSummary) {
    if (editingVectorId === node.id) {
      setEditingVectorId(undefined);
      setSelectedVectorPoint(undefined);
      return;
    }
    if (node.vector?.geometry.type !== "path")
      engineRef.current?.convert_vector_to_path(node.id);
    refreshDocument([node.id]);
    setEditingVectorId(node.id);
    setSelectedVectorPoint(undefined);
  }

  function beginVectorPointMove() {
    engineRef.current?.begin_transaction();
  }

  function moveVectorPoint(
    selection: VectorPointSelection,
    position: [number, number],
  ) {
    if (
      engineRef.current?.move_vector_point(
        selection.nodeId,
        selection.contourIndex,
        selection.pointIndex,
        position[0],
        position[1],
      )
    )
      refreshDocument([selection.nodeId]);
  }

  function endVectorPointMove() {
    engineRef.current?.end_transaction();
    refreshDocument(selectedNodeIdsRef.current);
  }

  function deleteVectorPoint(selection = selectedVectorPoint) {
    if (!selection) return;
    if (
      engineRef.current?.delete_vector_point(
        selection.nodeId,
        selection.contourIndex,
        selection.pointIndex,
      )
    ) {
      setSelectedVectorPoint(undefined);
      refreshDocument([selection.nodeId]);
    }
  }

  function cutVectorPath(node: NodeSummary) {
    if (!selectedVectorPoint || selectedVectorPoint.nodeId !== node.id) return;
    if (
      engineRef.current?.cut_vector_path(
        node.id,
        selectedVectorPoint.contourIndex,
        selectedVectorPoint.pointIndex,
      )
    ) {
      setSelectedVectorPoint(undefined);
      refreshDocument([node.id]);
    }
  }

  function joinVectorPath(node: NodeSummary) {
    if (engineRef.current?.join_vector_path(node.id)) {
      setSelectedVectorPoint(undefined);
      refreshDocument([node.id]);
    }
  }

  function exportSelectedVector(node: NodeSummary) {
    try {
      exportVectorSvg(node);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }

  return {
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
  };
}
