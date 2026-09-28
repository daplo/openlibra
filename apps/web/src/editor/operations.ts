import type {
  EntityId,
  NodeSummary,
  ShadowSummary,
  TextStyleSummary,
} from "./types";

export type OperationProperties = Partial<
  Pick<
    NodeSummary,
    | "name"
    | "locked"
    | "opacity"
    | "fill"
    | "stroke"
    | "stroke_width"
    | "corner_radii"
    | "stroke_align"
    | "stroke_join"
  >
> & { text?: TextStyleSummary; shadows?: ShadowSummary[] };
type NodeTarget = { page_id: EntityId; node_id: EntityId };
export type EditCommand =
  | {
      type: "create_node";
      page_id: EntityId;
      node: NodeSummary;
      before_id?: EntityId | null;
    }
  | ({ type: "delete_node" } & NodeTarget)
  | {
      type: "move_nodes";
      page_id: EntityId;
      node_ids: EntityId[];
      dx: number;
      dy: number;
    }
  | ({
      type: "set_bounds";
      x: number;
      y: number;
      width: number;
      height: number;
    } & NodeTarget)
  | ({
      type: "resize_node";
      handle: "n" | "ne" | "e" | "se" | "s" | "sw" | "w" | "nw";
      dx: number;
      dy: number;
    } & NodeTarget)
  | ({
      type: "set_transform";
      rotation: number;
      flip_x: boolean;
      flip_y: boolean;
    } & NodeTarget)
  | ({ type: "set_properties"; properties: OperationProperties } & NodeTarget)
  | ({
      type: "reparent_node";
      parent_id: EntityId | null;
      before_id?: EntityId | null;
    } & NodeTarget)
  | ({
      type: "reorder_node";
      target_id: EntityId;
      before: boolean;
    } & NodeTarget)
  | { type: "batch"; commands: EditCommand[] };
export type DocumentChange = {
  target: {
    kind:
      | "document"
      | "page"
      | "node"
      | "color"
      | "number_variable"
      | "text_style"
      | "media_asset"
      | "component";
    id?: string;
  };
  path: string[];
  before: { value: unknown } | null;
  after: { value: unknown } | null;
  ordered_ids: boolean;
};
export type OperationCommand =
  | EditCommand
  | { type: "document_changes"; changes: DocumentChange[] }
  | { type: "undo" | "redo"; operation_id: EntityId };
export type OperationEnvelope = {
  version: 1;
  document_id: EntityId;
  operation_id: EntityId;
  actor_id: EntityId;
  sequence: number;
  base_revision: number;
  transaction_id: EntityId;
  command: OperationCommand;
};
export type OperationState = {
  document_id: EntityId;
  actor_id: EntityId;
  revision: number;
  next_sequence: number;
  error: string | null;
};
export type OperationReceipt = {
  status: "applied" | "duplicate";
  revision: number;
  operation_id: EntityId;
};

/** Build once and retain this envelope when retrying; a retry must keep its IDs. */
export function createOperation(
  state: OperationState,
  command: OperationCommand,
): OperationEnvelope {
  return {
    version: 1,
    document_id: state.document_id,
    operation_id: crypto.randomUUID(),
    actor_id: state.actor_id,
    sequence: state.next_sequence,
    base_revision: state.revision,
    transaction_id: crypto.randomUUID(),
    command,
  };
}
