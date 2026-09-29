export type Mode = "design" | "developer" | "review";
export type EntityId = string;
export type PageSummary = {
  id: EntityId;
  name: string;
  description: string;
  benchmark_node_count?: number | null;
};
export type ColorAsset = { id: EntityId; name: string; value: string };
export type NumberVariable = { id: EntityId; name: string; value: number };
export type TypographyStyle = Omit<TextStyleSummary, "content">;
export type TextStyleAsset = {
  id: EntityId;
  name: string;
  style: TypographyStyle;
};
export type MediaAsset = {
  id: EntityId;
  name: string;
  kind: "image" | "icon";
  mime_type: string;
  source: string;
  width: number;
  height: number;
  tags: string[];
};
export type ComponentVariant = {
  id: EntityId;
  name: string;
  source_root_id: EntityId;
};
export type ComponentDefinition = {
  id: EntityId;
  name: string;
  variants: ComponentVariant[];
};
export type VariableBindings = {
  width?: EntityId;
  height?: EntityId;
  gap?: EntityId;
  padding: Array<EntityId | null>;
};
export type ShadowSummary = {
  id: EntityId;
  kind: "outer" | "inner";
  color: number[];
  offset_x: number;
  offset_y: number;
  blur: number;
  spread: number;
  enabled: boolean;
};
export type TextStyleSummary = {
  content: string;
  font_family: string;
  font_weight: number;
  font_size: number;
  line_height: number;
  letter_spacing: number;
  horizontal_align: "left" | "center" | "right" | "justify";
  vertical_align: "top" | "middle" | "bottom";
  font_style: "normal" | "italic";
  sizing: "auto_width" | "auto_height" | "fixed";
};
export type NodeSummary = {
  id: EntityId;
  name: string;
  kind: "frame" | "rectangle" | "group" | "text" | "image" | "icon" | "vector";
  parent_id?: EntityId;
  mask_shape?: boolean;
  boolean_operation?: "union" | "subtract" | "intersect" | "exclude";
  boolean_operands?: EntityId[];
  x: number;
  y: number;
  width: number;
  height: number;
  fill: number[];
  stroke: number[];
  stroke_width: number;
  corner_radii: number[];
  stroke_align: "inside" | "center" | "outside";
  stroke_join: "round" | "straight";
  opacity: number;
  rotation: number;
  flip_x: boolean;
  flip_y: boolean;
  shadows: ShadowSummary[];
  layout_mode: "none" | "row" | "column";
  layout_align: "start" | "center" | "end";
  layout_justify: "start" | "center" | "end";
  layout_gap: number;
  layout_padding: number[];
  width_sizing: "fixed" | "fill";
  auto_height: boolean;
  guide_mode: "none" | "grid" | "columns";
  guide_count: number;
  guide_gap: number;
  guide_color: number[];
  guide_opacity: number;
  locked: boolean;
  text?: TextStyleSummary;
  vector?: VectorData;
  variable_bindings: VariableBindings;
  text_style_id?: EntityId;
  asset_id?: EntityId;
  image_fit: "cover" | "contain" | "fill";
  component_id?: EntityId;
  component_variant_id?: EntityId;
  component_slot_id?: EntityId;
  instance_root_id?: EntityId;
  text_override: boolean;
  asset_override: boolean;
};

export type VectorData = {
  geometry:
    | { type: "ellipse" }
    | { type: "line" }
    | { type: "polygon"; sides: number }
    | { type: "star"; points: number; inner_ratio: number }
    | { type: "path"; contours: VectorContour[] };
  fill_rule: "nonzero" | "evenodd";
};

export type VectorContour = {
  points: VectorPoint[];
  closed: boolean;
};

export type VectorPoint = {
  position: [number, number];
  handle_in?: [number, number];
  handle_out?: [number, number];
  point_type: "corner" | "smooth" | "symmetric";
};
export type DocumentReadModel = {
  schema_version: number;
  active_page_id: EntityId;
  pages: PageSummary[];
  nodes: NodeSummary[];
  document_colors: ColorAsset[];
  number_variables: NumberVariable[];
  text_styles: TextStyleAsset[];
  media_assets: MediaAsset[];
  components: ComponentDefinition[];
};
