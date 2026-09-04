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
      engineRef.current?.move_vector_point_by_id(
        selection.nodeId,
        selection.contourId,
        selection.pointId,
        position[0],
        position[1],
      )
    )
      refreshDocument([selection.nodeId]);
  }

  function moveVectorHandle(
    selection: VectorPointSelection,
    handle: "in" | "out",
    position: [number, number],
  ) {
    if (
      engineRef.current?.move_vector_handle_by_id(
        selection.nodeId,
        selection.contourId,
        selection.pointId,
        handle,
        position[0],
        position[1],
      )
    )
      refreshDocument([selection.nodeId]);
  }

  function setVectorPointType(
    selection: VectorPointSelection,
    pointType: "corner" | "smooth" | "symmetric",
  ) {
    engineRef.current?.begin_transaction();
    const changed = Boolean(
      engineRef.current?.set_vector_point_type_by_id(
        selection.nodeId,
        selection.contourId,
        selection.pointId,
        pointType,
      ),
    );
    if (changed) engineRef.current?.reframe_vector_path(selection.nodeId);
    engineRef.current?.end_transaction();
    if (changed) refreshDocument([selection.nodeId]);
  }

  function insertVectorPoint(
    node: NodeSummary,
    contourId: string,
    startPointId: string,
    t: number,
  ) {
    engineRef.current?.begin_transaction();
    const pointId = engineRef.current?.insert_vector_point_by_id(
      node.id,
      contourId,
      startPointId,
      t,
    );
    if (!pointId) {
      engineRef.current?.end_transaction();
      return;
    }
    engineRef.current?.reframe_vector_path(node.id);
    engineRef.current?.end_transaction();
    refreshDocument([node.id]);
    const nextNode = JSON.parse(
      engineRef.current!.node_json(node.id),
    ) as NodeSummary;
    const contour =
      nextNode.vector?.geometry.type === "path"
        ? nextNode.vector.geometry.contours.find(
            (item) => item.id === contourId,
          )
        : undefined;
    const pointIndex =
      contour?.points.findIndex((point) => point.id === pointId) ?? -1;
    if (contour && pointIndex >= 0)
      setSelectedVectorPoint({
        nodeId: node.id,
        contourId,
        pointId,
        contourIndex:
          nextNode.vector!.geometry.type === "path"
            ? nextNode.vector!.geometry.contours.findIndex(
                (item) => item.id === contourId,
              )
            : 0,
        pointIndex,
      });
  }

  function cutVectorSegment(
    node: NodeSummary,
    contourId: string,
    startPointId: string,
    t: number,
  ) {
    engineRef.current?.begin_transaction();
    const changed = Boolean(
      engineRef.current?.cut_vector_segment_by_id(
        node.id,
        contourId,
        startPointId,
        t,
      ),
    );
    if (changed) {
      engineRef.current?.reframe_vector_path(node.id);
      setSelectedVectorPoint(undefined);
    }
    engineRef.current?.end_transaction();
    if (changed) refreshDocument([node.id]);
  }

  function createVectorPath(
    points: Array<{
      position: [number, number];
      handle_in?: [number, number];
      handle_out?: [number, number];
      point_type: "corner" | "smooth" | "symmetric";
    }>,
    closed: boolean,
  ) {
    const engine = engineRef.current;
    if (!engine) return;
    const parentId = preferredArtboardId(
      documentModel.nodes,
      selectedNodeIdsRef.current,
    );
    try {
      const id = engine.add_vector_path(
        JSON.stringify(points),
        closed,
        parentId ?? "",
      );
      refreshDocument([id]);
      return id;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }

  function knifeVectorPath(
    node: NodeSummary,
    start: [number, number],
    end: [number, number],
  ) {
    engineRef.current?.begin_transaction();
    const changed = Boolean(
      engineRef.current?.knife_vector_path(
        node.id,
        start[0],
        start[1],
        end[0],
        end[1],
      ),
    );
    engineRef.current?.end_transaction();
    if (changed) {
      setSelectedVectorPoint(undefined);
      refreshDocument([node.id]);
    }
  }

  function endVectorPointMove() {
    if (editingVectorId)
      engineRef.current?.reframe_vector_path(editingVectorId);
    engineRef.current?.end_transaction();
    refreshDocument(selectedNodeIdsRef.current);
  }

  function deleteVectorPoint(selection = selectedVectorPoint) {
    if (!selection) return;
    engineRef.current?.begin_transaction();
    const changed = Boolean(
      engineRef.current?.delete_vector_point_by_id(
        selection.nodeId,
        selection.contourId,
        selection.pointId,
      ),
    );
    if (changed) {
      engineRef.current?.reframe_vector_path(selection.nodeId);
      setSelectedVectorPoint(undefined);
    }
    engineRef.current?.end_transaction();
    if (changed) refreshDocument([selection.nodeId]);
  }

  function cutVectorPath(node: NodeSummary) {
    if (!selectedVectorPoint || selectedVectorPoint.nodeId !== node.id) return;
    engineRef.current?.begin_transaction();
    const changed = Boolean(
      engineRef.current?.cut_vector_path_by_id(
        node.id,
        selectedVectorPoint.contourId,
        selectedVectorPoint.pointId,
      ),
    );
    if (changed) {
      engineRef.current?.reframe_vector_path(node.id);
      setSelectedVectorPoint(undefined);
    }
    engineRef.current?.end_transaction();
    if (changed) refreshDocument([node.id]);
  }

  function joinVectorPath(node: NodeSummary) {
    engineRef.current?.begin_transaction();
    const changed = Boolean(engineRef.current?.join_vector_path(node.id));
    if (changed) {
      engineRef.current?.reframe_vector_path(node.id);
      setSelectedVectorPoint(undefined);
    }
    engineRef.current?.end_transaction();
    if (changed) refreshDocument([node.id]);
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
    moveVectorHandle,
    setVectorPointType,
    insertVectorPoint,
    cutVectorSegment,
    createVectorPath,
    knifeVectorPath,
    endVectorPointMove,
    deleteVectorPoint,
    cutVectorPath,
    joinVectorPath,
    exportSelectedVector,
  };
}
