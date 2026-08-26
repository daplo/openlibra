import type { Dispatch, SetStateAction } from "react";
import { componentSourceRootForNode } from "./app-utils";
import { preferredArtboardId } from "./model-utils";
import type { DocumentReadModel, NodeSummary } from "./types";
import { useEditorInfrastructure } from "./EditorContext";

export function useComponentCommands({
  documentModel,
  selectedNodes,
  refreshDocument,
  applySelection,
  setLibraryOpen,
  setIsolationRootId,
  setCanvasContextMenu,
}: {
  documentModel: DocumentReadModel;
  selectedNodes: NodeSummary[];
  refreshDocument: (selection?: string[]) => void;
  applySelection: (ids: string[]) => void;
  setLibraryOpen: Dispatch<SetStateAction<boolean>>;
  setIsolationRootId: Dispatch<SetStateAction<string | undefined>>;
  setCanvasContextMenu: Dispatch<
    SetStateAction<{ x: number; y: number; sourceRootId: string } | undefined>
  >;
}) {
  const {
    engineRef,
    rendererRef,
    nodesByIdRef,
    isolationRootIdRef,
    documentModelRef,
  } = useEditorInfrastructure();
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

  return {
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
  };
}
