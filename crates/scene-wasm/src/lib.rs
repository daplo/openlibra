mod color;
mod document;
mod edit;
mod geometry;
mod layout;
mod model;
mod scene;

use color::{normalize_hex_color, parse_hex_color};
use geometry::point_in_rotated_node;
use model::*;
use scene::ordered_nodes;
use uuid::Uuid;
use wasm_bindgen::prelude::*;

const SCHEMA_VERSION: u32 = 7;
const FLOATS_PER_RECT: usize = 24;

#[derive(serde::Deserialize)]
struct FigmaImportPayload {
    pages: Vec<FigmaImportPage>,
    #[serde(default)]
    assets: Vec<FigmaImportAsset>,
}

#[derive(serde::Deserialize)]
struct FigmaImportPage {
    name: String,
    nodes: Vec<FigmaImportNode>,
}

#[derive(serde::Deserialize)]
struct FigmaImportAsset {
    source_id: String,
    name: String,
    mime_type: String,
    source: String,
}

#[derive(serde::Deserialize)]
struct FigmaImportNode {
    source_id: String,
    #[serde(default)]
    parent_source_id: Option<String>,
    name: String,
    kind: NodeKind,
    x: f32,
    y: f32,
    width: f32,
    height: f32,
    fill: [f32; 4],
    stroke: [f32; 4],
    stroke_width: f32,
    corner_radii: [f32; 4],
    stroke_align: StrokeAlign,
    opacity: f32,
    rotation: f32,
    layout_mode: LayoutMode,
    layout_gap: f32,
    layout_padding: [f32; 4],
    #[serde(default)]
    shadows: Vec<Shadow>,
    #[serde(default)]
    text: Option<TextStyle>,
    #[serde(default)]
    asset_source_id: Option<String>,
}

fn parse_entity_id(value: &str) -> EntityId {
    Uuid::parse_str(value).unwrap_or_else(|_| Uuid::nil())
}

fn migrate_legacy_document_ids(value: &mut serde_json::Value) {
    let schema = value
        .get("schema_version")
        .and_then(|version| version.as_u64())
        .unwrap_or(1);
    let migrate_id = |id: &mut serde_json::Value| {
        if let Some(number) = id.as_u64() {
            *id = serde_json::Value::String(
                Uuid::new_v5(
                    &Uuid::NAMESPACE_OID,
                    format!("open-libra-v1:{number}").as_bytes(),
                )
                .to_string(),
            );
        }
    };
    if schema == 1
        && let Some(id) = value.get_mut("active_page_id")
    {
        migrate_id(id);
    }
    if let Some(pages) = value
        .get_mut("pages")
        .and_then(|pages| pages.as_array_mut())
    {
        for page in pages {
            if schema == 1
                && let Some(id) = page.get_mut("id")
            {
                migrate_id(id);
            }
            if let Some(nodes) = page.get_mut("nodes").and_then(|nodes| nodes.as_array_mut()) {
                for node in nodes {
                    if schema == 1
                        && let Some(id) = node.get_mut("id")
                    {
                        migrate_id(id);
                    }
                    if schema == 1
                        && let Some(parent) = node.get_mut("parent_id")
                    {
                        migrate_id(parent);
                    }
                    if node.get("corner_radii").is_none() {
                        let radius = node
                            .get("corner_radius")
                            .and_then(|value| value.as_f64())
                            .unwrap_or(0.0);
                        node["corner_radii"] = serde_json::json!([radius, radius, radius, radius]);
                    }
                    if node.get("stroke_align").is_none() {
                        node["stroke_align"] = serde_json::Value::String("inside".into());
                    }
                    if node.get("stroke_join").is_none() {
                        node["stroke_join"] = serde_json::Value::String("round".into());
                    }
                    if node.get("kind").and_then(|kind| kind.as_str()) == Some("text")
                        && node.get("text").is_none()
                    {
                        node["text"] = serde_json::to_value(TextStyle::default()).unwrap();
                    }
                }
            }
            if let Some(ids) = page
                .get_mut("benchmark_modified_node_ids")
                .and_then(|ids| ids.as_array_mut())
                && schema == 1
            {
                for id in ids {
                    migrate_id(id);
                }
            }
        }
    }
    if let Some(colors) = value
        .get_mut("color_library")
        .and_then(|colors| colors.as_array_mut())
    {
        for color in colors {
            if schema == 1
                && let Some(id) = color.get_mut("id")
            {
                migrate_id(id);
            }
        }
    }
    value["schema_version"] = serde_json::Value::from(SCHEMA_VERSION);
}

#[derive(Clone, PartialEq)]
struct NodeStyleState {
    fill: [f32; 4],
    stroke: [f32; 4],
    stroke_width: f32,
    corner_radii: [f32; 4],
    stroke_align: StrokeAlign,
    stroke_join: StrokeJoin,
}

impl NodeStyleState {
    fn capture(node: &Node) -> Self {
        Self {
            fill: node.fill,
            stroke: node.stroke,
            stroke_width: node.stroke_width,
            corner_radii: node.corner_radii,
            stroke_align: node.stroke_align,
            stroke_join: node.stroke_join,
        }
    }

    fn apply(self, node: &mut Node) {
        node.fill = self.fill;
        node.stroke = self.stroke;
        node.stroke_width = self.stroke_width;
        node.corner_radii = self.corner_radii;
        node.stroke_align = self.stroke_align;
        node.stroke_join = self.stroke_join;
    }
}

#[derive(Clone, PartialEq)]
struct NodeGeometryState {
    id: EntityId,
    parent_id: Option<EntityId>,
    x: f32,
    y: f32,
    width: f32,
    height: f32,
    corner_radii: [f32; 4],
    rotation: f32,
    flip_x: bool,
    flip_y: bool,
}

impl NodeGeometryState {
    fn capture(node: &Node) -> Self {
        Self {
            id: node.id,
            parent_id: node.parent_id,
            x: node.x,
            y: node.y,
            width: node.width,
            height: node.height,
            corner_radii: node.corner_radii,
            rotation: node.rotation,
            flip_x: node.flip_x,
            flip_y: node.flip_y,
        }
    }

    fn apply(self, node: &mut Node) {
        node.parent_id = self.parent_id;
        node.x = self.x;
        node.y = self.y;
        node.width = self.width;
        node.height = self.height;
        node.corner_radii = self.corner_radii;
        node.rotation = self.rotation;
        node.flip_x = self.flip_x;
        node.flip_y = self.flip_y;
    }
}

enum HistoryEntry {
    Document(Document),
    NodeStyle {
        page_id: EntityId,
        node_id: EntityId,
        style: NodeStyleState,
    },
    Geometry {
        page_id: EntityId,
        nodes: Vec<NodeGeometryState>,
    },
}

impl HistoryEntry {
    fn apply(self, document: &mut Document) -> Self {
        match self {
            Self::Document(previous) => Self::Document(std::mem::replace(document, previous)),
            Self::NodeStyle {
                page_id,
                node_id,
                style,
            } => {
                let node = document
                    .pages
                    .iter_mut()
                    .find(|page| page.id == page_id)
                    .and_then(|page| page.nodes.iter_mut().find(|node| node.id == node_id));
                // The node may have been deleted by a later command while this
                // entry sat on the undo/redo stack; treat that as a no-op
                // instead of panicking.
                if let Some(node) = node {
                    let inverse = NodeStyleState::capture(node);
                    style.apply(node);
                    Self::NodeStyle {
                        page_id,
                        node_id,
                        style: inverse,
                    }
                } else {
                    Self::NodeStyle {
                        page_id,
                        node_id,
                        style,
                    }
                }
            }
            Self::Geometry { page_id, nodes } => {
                let Some(page) = document.pages.iter_mut().find(|page| page.id == page_id) else {
                    return Self::Geometry { page_id, nodes };
                };
                let mut inverse = Vec::with_capacity(nodes.len());
                for state in nodes {
                    // Nodes captured by an in-flight geometry transaction can
                    // be deleted before the transaction ends; skip them
                    // instead of panicking, and keep their captured state so
                    // a later redo/undo of this entry stays a no-op for them.
                    let Some(node) = page.nodes.iter_mut().find(|node| node.id == state.id) else {
                        inverse.push(state);
                        continue;
                    };
                    inverse.push(NodeGeometryState::capture(node));
                    state.apply(node);
                }
                Self::Geometry {
                    page_id,
                    nodes: inverse,
                }
            }
        }
    }
}

#[wasm_bindgen]
pub struct DocumentEngine {
    document: Document,
    undo_stack: Vec<HistoryEntry>,
    redo_stack: Vec<HistoryEntry>,
    transaction_start: Option<Document>,
    geometry_transaction_start: Option<HistoryEntry>,
}

#[wasm_bindgen]
impl DocumentEngine {
    #[wasm_bindgen(constructor)]
    pub fn new() -> Self {
        console_error_panic_hook::set_once();
        Self {
            document: Document::demo(),
            undo_stack: Vec::new(),
            redo_stack: Vec::new(),
            transaction_start: None,
            geometry_transaction_start: None,
        }
    }

    pub fn scene_data(&self) -> Vec<f32> {
        self.document.scene_data()
    }

    pub fn scene_data_for_view(&self, left: f32, top: f32, right: f32, bottom: f32) -> Vec<f32> {
        self.document.scene_data_for_view(left, top, right, bottom)
    }

    pub fn rect_count(&self) -> usize {
        self.scene_data().len() / FLOATS_PER_RECT
    }

    pub fn read_model_json(&self) -> String {
        serde_json::to_string(&self.document.read_model()).expect("read model is serializable")
    }

    pub fn document_json(&self) -> String {
        serde_json::to_string(&self.document).expect("document is serializable")
    }

    pub fn node_json(&self, node_id: String) -> String {
        let node_id = parse_entity_id(&node_id);
        self.document
            .active_node(node_id)
            .and_then(|node| serde_json::to_string(node).ok())
            .unwrap_or_default()
    }

    pub fn add_rectangle(&mut self) -> String {
        self.mutate(|document| document.add_node(NodeKind::Rectangle))
            .to_string()
    }

    pub fn add_rectangle_to(&mut self, parent_id: String) -> String {
        let parent_id = parse_entity_id(&parent_id);
        self.mutate(|document| {
            document.add_rectangle_to((!parent_id.is_nil()).then_some(parent_id))
        })
        .to_string()
    }

    pub fn add_frame(&mut self) -> String {
        self.mutate(|document| document.add_node(NodeKind::Frame))
            .to_string()
    }

    pub fn add_text(&mut self) -> String {
        self.mutate(|document| document.add_node(NodeKind::Text))
            .to_string()
    }

    pub fn add_text_to(&mut self, parent_id: String) -> String {
        let parent_id = parse_entity_id(&parent_id);
        self.mutate(|document| document.add_text_to((!parent_id.is_nil()).then_some(parent_id)))
            .to_string()
    }

    #[allow(clippy::too_many_arguments)]
    pub fn add_media_asset_node(
        &mut self,
        kind: String,
        name: String,
        mime_type: String,
        source: String,
        width: u32,
        height: u32,
        parent_id: String,
    ) -> String {
        let parent_id = parse_entity_id(&parent_id);
        let kind = if kind == "icon" {
            MediaAssetKind::Icon
        } else {
            MediaAssetKind::Image
        };
        self.mutate(|document| {
            document.add_media_asset_node(
                kind,
                name,
                mime_type,
                source,
                width,
                height,
                (!parent_id.is_nil()).then_some(parent_id),
            )
        })
        .map_or_else(String::new, |id| id.to_string())
    }

    pub fn add_node_from_asset(&mut self, asset_id: String, parent_id: String) -> String {
        let asset_id = parse_entity_id(&asset_id);
        let parent_id = parse_entity_id(&parent_id);
        self.mutate(|document| {
            document.add_node_from_asset(asset_id, (!parent_id.is_nil()).then_some(parent_id))
        })
        .map_or_else(String::new, |id| id.to_string())
    }

    pub fn add_artboard(
        &mut self,
        name: String,
        width: f32,
        height: f32,
    ) -> Result<String, JsValue> {
        if !width.is_finite()
            || !height.is_finite()
            || width < 1.0
            || height < 1.0
            || width > 16_384.0
            || height > 16_384.0
        {
            return Err(JsValue::from_str(
                "Artboard dimensions must be between 1 and 16,384 pixels",
            ));
        }
        Ok(self
            .mutate(|document| document.add_artboard(name, width, height))
            .to_string())
    }

    pub fn add_page(&mut self, name: String) -> String {
        self.mutate(|document| document.add_page(name)).to_string()
    }

    pub fn rename_page(&mut self, page_id: String, name: String) -> bool {
        let page_id = parse_entity_id(&page_id);
        self.mutate(|document| document.rename_page(page_id, name))
    }

    pub fn delete_page(&mut self, page_id: String) -> bool {
        let page_id = parse_entity_id(&page_id);
        self.mutate(|document| document.delete_page(page_id))
    }

    pub fn ungroup_nodes(&mut self, group_id: String) -> bool {
        let group_id = parse_entity_id(&group_id);
        self.mutate(|document| document.ungroup_nodes(group_id))
    }

    pub fn import_figma_json(&mut self, json: &str) -> Result<String, JsValue> {
        let payload: FigmaImportPayload = serde_json::from_str(json)
            .map_err(|error| JsValue::from_str(&format!("Invalid Figma import: {error}")))?;
        if payload.pages.is_empty() {
            return Err(JsValue::from_str("The Figma import contains no pages"));
        }
        let imported_page_id = self.mutate(|document| {
            let mut assets = std::collections::HashMap::new();
            for asset in payload.assets {
                let id = document.allocate_id();
                assets.insert(asset.source_id, id);
                document.media_assets.push(MediaAsset {
                    id,
                    name: asset.name,
                    kind: MediaAssetKind::Image,
                    mime_type: asset.mime_type,
                    source: asset.source,
                    width: 0,
                    height: 0,
                    tags: vec!["figma".into(), "imported".into()],
                });
            }
            let mut first_page_id = None;
            for page in payload.pages {
                let page_id = document.add_page(if page.name.trim().is_empty() {
                    "Imported page".into()
                } else {
                    page.name
                });
                first_page_id.get_or_insert(page_id);
                let mut node_ids = std::collections::HashMap::new();
                for imported in page.nodes {
                    if ![
                        imported.x,
                        imported.y,
                        imported.width,
                        imported.height,
                        imported.stroke_width,
                        imported.opacity,
                        imported.rotation,
                        imported.layout_gap,
                    ]
                    .iter()
                    .all(|value| value.is_finite())
                    {
                        continue;
                    }
                    let parent_id = imported
                        .parent_source_id
                        .as_ref()
                        .and_then(|source| node_ids.get(source).copied());
                    let id = document.insert_node(
                        &imported.name,
                        imported.kind,
                        parent_id,
                        [
                            imported.x,
                            imported.y,
                            imported.width.max(1.0),
                            imported.height.max(1.0),
                        ],
                        imported.fill,
                    );
                    if let Some(node) = document.active_node_mut(id) {
                        node.stroke = imported.stroke;
                        node.stroke_width = imported.stroke_width.max(0.0);
                        node.corner_radii = imported.corner_radii.map(|value| value.max(0.0));
                        node.stroke_align = imported.stroke_align;
                        node.opacity = imported.opacity.clamp(0.0, 1.0);
                        node.rotation = imported.rotation;
                        node.layout_mode = imported.layout_mode;
                        node.layout_gap = imported.layout_gap.max(0.0);
                        node.layout_padding = imported.layout_padding.map(|value| value.max(0.0));
                        node.shadows = imported.shadows;
                        node.text = imported.text;
                        node.asset_id = imported
                            .asset_source_id
                            .as_ref()
                            .and_then(|source| assets.get(source).copied());
                    }
                    node_ids.insert(imported.source_id, id);
                }
            }
            let page_id = first_page_id.expect("pages were checked above");
            document.set_active_page(page_id);
            page_id
        });
        Ok(imported_page_id.to_string())
    }

    pub fn set_active_page(&mut self, page_id: String) -> bool {
        self.document.set_active_page(parse_entity_id(&page_id))
    }

    pub fn delete_node(&mut self, node_id: String) -> bool {
        let node_id = parse_entity_id(&node_id);
        // A geometry transaction only records geometry for nodes that still
        // exist when it ends. Finish it before a structural deletion so the
        // move and deletion receive independent, complete history entries.
        self.end_transaction();
        self.mutate(|document| document.delete_node(node_id))
    }

    pub fn rename_node(&mut self, node_id: String, name: String) -> bool {
        let node_id = parse_entity_id(&node_id);
        self.mutate(|document| document.rename_node(node_id, name))
    }

    pub fn group_nodes(&mut self, node_ids_json: &str) -> Result<String, JsValue> {
        let node_ids: Vec<EntityId> = serde_json::from_str(node_ids_json)
            .map_err(|error| JsValue::from_str(&format!("Invalid node selection: {error}")))?;
        self.mutate(|document| document.group_nodes(&node_ids))
            .map(|id| id.to_string())
            .ok_or_else(|| {
                JsValue::from_str("At least two existing nodes are required to create a group")
            })
    }

    pub fn duplicate_nodes(&mut self, node_ids_json: &str) -> Result<String, JsValue> {
        let node_ids: Vec<EntityId> = serde_json::from_str(node_ids_json)
            .map_err(|error| JsValue::from_str(&format!("Invalid node selection: {error}")))?;
        let ids = self.mutate(|document| document.duplicate_nodes(&node_ids));
        serde_json::to_string(&ids)
            .map_err(|error| JsValue::from_str(&format!("Could not serialize duplicates: {error}")))
    }

    pub fn create_component(&mut self, root_id: String, name: String) -> String {
        let root_id = parse_entity_id(&root_id);
        self.mutate(|document| document.create_component(root_id, name))
            .map_or_else(String::new, |id| id.to_string())
    }

    pub fn add_component_variant(
        &mut self,
        component_id: String,
        root_id: String,
        name: String,
    ) -> String {
        let component_id = parse_entity_id(&component_id);
        let root_id = parse_entity_id(&root_id);
        self.mutate(|document| document.add_component_variant(component_id, root_id, name))
            .map_or_else(String::new, |id| id.to_string())
    }

    pub fn duplicate_component_variant(
        &mut self,
        component_id: String,
        source_variant_id: String,
        name: String,
    ) -> String {
        let component_id = parse_entity_id(&component_id);
        let source_variant_id = parse_entity_id(&source_variant_id);
        self.mutate(|document| {
            document.duplicate_component_variant(component_id, source_variant_id, name)
        })
        .map_or_else(String::new, |id| id.to_string())
    }

    pub fn create_component_instance(
        &mut self,
        component_id: String,
        variant_id: String,
        parent_id: String,
    ) -> String {
        let component_id = parse_entity_id(&component_id);
        let variant_id = parse_entity_id(&variant_id);
        let parent_id = parse_entity_id(&parent_id);
        self.mutate(|document| {
            document.create_component_instance(
                component_id,
                variant_id,
                (!parent_id.is_nil()).then_some(parent_id),
            )
        })
        .map_or_else(String::new, |id| id.to_string())
    }

    pub fn set_instance_variant(&mut self, instance_id: String, variant_id: String) -> String {
        let instance_id = parse_entity_id(&instance_id);
        let variant_id = parse_entity_id(&variant_id);
        self.mutate(|document| document.set_instance_variant(instance_id, variant_id))
            .map_or_else(String::new, |id| id.to_string())
    }

    pub fn move_nodes(&mut self, node_ids_json: &str, dx: f32, dy: f32) -> Result<bool, JsValue> {
        let node_ids: Vec<EntityId> = serde_json::from_str(node_ids_json)
            .map_err(|error| JsValue::from_str(&format!("Invalid node selection: {error}")))?;
        Ok(self.mutate(|document| document.move_nodes(&node_ids, dx, dy)))
    }

    pub fn reorder_node(&mut self, dragged_id: String, target_id: String, before: bool) -> bool {
        let dragged_id = parse_entity_id(&dragged_id);
        let target_id = parse_entity_id(&target_id);
        self.mutate(|document| document.reorder_node(dragged_id, target_id, before))
    }

    pub fn reparent_nodes_to_artboards(&mut self, node_ids_json: &str) -> Result<bool, JsValue> {
        let node_ids: Vec<EntityId> = serde_json::from_str(node_ids_json)
            .map_err(|error| JsValue::from_str(&format!("Invalid node selection: {error}")))?;
        Ok(self.mutate(|document| document.reparent_nodes_to_artboards(&node_ids)))
    }

    // Kept flat because wasm-bindgen exposes this method directly to JavaScript.
    #[allow(clippy::too_many_arguments)]
    pub fn set_node_style(
        &mut self,
        node_id: String,
        fill_hex: String,
        stroke_hex: String,
        stroke_width: f32,
        radius_top_left: f32,
        radius_top_right: f32,
        radius_bottom_right: f32,
        radius_bottom_left: f32,
        stroke_align: String,
        stroke_join: String,
    ) -> Result<bool, JsValue> {
        let node_id = parse_entity_id(&node_id);
        let corner_radii = [
            radius_top_left,
            radius_top_right,
            radius_bottom_right,
            radius_bottom_left,
        ];
        let stroke_align = match stroke_align.as_str() {
            "center" => StrokeAlign::Center,
            "outside" => StrokeAlign::Outside,
            _ => StrokeAlign::Inside,
        };
        let stroke_join = if stroke_join == "straight" {
            StrokeJoin::Straight
        } else {
            StrokeJoin::Round
        };
        let fill = parse_hex_color(&fill_hex)
            .ok_or_else(|| JsValue::from_str("Fill must be a six-digit hex color"))?;
        let stroke = parse_hex_color(&stroke_hex)
            .ok_or_else(|| JsValue::from_str("Border must be a six-digit hex color"))?;
        if self.transaction_start.is_some() {
            return Ok(self.document.set_node_style(
                node_id,
                fill,
                stroke,
                stroke_width,
                corner_radii,
                stroke_align,
                stroke_join,
            ));
        }
        let page_id = self.document.active_page_id;
        let before = self
            .document
            .active_page()
            .nodes
            .iter()
            .find(|node| node.id == node_id)
            .map(NodeStyleState::capture);
        let changed = self.document.set_node_style(
            node_id,
            fill,
            stroke,
            stroke_width,
            corner_radii,
            stroke_align,
            stroke_join,
        );
        if changed {
            let is_component_source = self.document.active_node(node_id).is_some_and(|node| {
                node.instance_root_id.is_none() && node.component_slot_id == Some(node.id)
            });
            if is_component_source {
                self.document.sync_component_instances();
            }
            if let Some(style) = before {
                self.push_undo(HistoryEntry::NodeStyle {
                    page_id,
                    node_id,
                    style,
                });
            }
            self.redo_stack.clear();
        }
        Ok(changed)
    }

    pub fn resize_node(&mut self, node_id: String, handle: String, dx: f32, dy: f32) -> bool {
        let node_id = parse_entity_id(&node_id);
        self.mutate(|document| document.resize_node(node_id, &handle, dx, dy))
    }

    pub fn set_node_locked(&mut self, node_id: String, locked: bool) -> bool {
        let node_id = parse_entity_id(&node_id);
        self.mutate(|document| document.set_node_locked(node_id, locked))
    }

    pub fn set_node_text(&mut self, node_id: String, text_json: &str) -> Result<bool, JsValue> {
        let text: TextStyle = serde_json::from_str(text_json)
            .map_err(|error| JsValue::from_str(&format!("Invalid text style: {error}")))?;
        let node_id = parse_entity_id(&node_id);
        Ok(self.mutate(|document| document.set_node_text(node_id, text)))
    }

    pub fn set_node_image_fit(&mut self, node_id: String, fit: String) -> bool {
        let node_id = parse_entity_id(&node_id);
        let fit = match fit.as_str() {
            "contain" => ImageFit::Contain,
            "fill" => ImageFit::Fill,
            _ => ImageFit::Cover,
        };
        self.mutate(|document| document.set_node_image_fit(node_id, fit))
    }

    pub fn set_node_asset(&mut self, node_id: String, asset_id: String) -> bool {
        let node_id = parse_entity_id(&node_id);
        let asset_id = parse_entity_id(&asset_id);
        self.mutate(|document| document.set_node_asset(node_id, asset_id))
    }

    pub fn set_node_opacity(&mut self, node_id: String, opacity: f32) -> bool {
        let node_id = parse_entity_id(&node_id);
        self.mutate(|document| document.set_node_opacity(node_id, opacity))
    }

    pub fn set_node_shadows(
        &mut self,
        node_id: String,
        shadows_json: &str,
    ) -> Result<bool, JsValue> {
        let node_id = parse_entity_id(&node_id);
        let shadows: Vec<Shadow> = serde_json::from_str(shadows_json)
            .map_err(|error| JsValue::from_str(&format!("Invalid shadows: {error}")))?;
        Ok(self.mutate(|document| document.set_node_shadows(node_id, shadows)))
    }

    pub fn set_node_transform(
        &mut self,
        node_id: String,
        rotation: f32,
        flip_x: bool,
        flip_y: bool,
    ) -> bool {
        let node_id = parse_entity_id(&node_id);
        self.mutate(|document| document.set_node_transform(node_id, rotation, flip_x, flip_y))
    }

    // Keep scalar arguments at the WASM boundary so JavaScript callers do not
    // need to construct or serialize a Rust-specific layout type.
    #[allow(clippy::too_many_arguments)]
    pub fn set_node_layout(
        &mut self,
        node_id: String,
        mode: String,
        align: String,
        justify: String,
        gap: f32,
        top: f32,
        right: f32,
        bottom: f32,
        left: f32,
    ) -> bool {
        let node_id = parse_entity_id(&node_id);
        let mode = match mode.as_str() {
            "row" => LayoutMode::Row,
            "column" => LayoutMode::Column,
            _ => LayoutMode::None,
        };
        let align = match align.as_str() {
            "center" => LayoutAlign::Center,
            "end" => LayoutAlign::End,
            _ => LayoutAlign::Start,
        };
        let justify = match justify.as_str() {
            "center" => LayoutAlign::Center,
            "end" => LayoutAlign::End,
            _ => LayoutAlign::Start,
        };
        self.mutate(|document| {
            document.set_node_layout(
                node_id,
                mode,
                align,
                justify,
                gap,
                [top, right, bottom, left],
            )
        })
    }

    pub fn set_node_width_sizing(&mut self, node_id: String, sizing: String) -> bool {
        let node_id = parse_entity_id(&node_id);
        let sizing = if sizing == "fill" {
            LayoutSizing::Fill
        } else {
            LayoutSizing::Fixed
        };
        self.mutate(|document| document.set_node_width_sizing(node_id, sizing))
    }

    pub fn set_node_auto_height(&mut self, node_id: String, auto_height: bool) -> bool {
        let node_id = parse_entity_id(&node_id);
        self.mutate(|document| document.set_node_auto_height(node_id, auto_height))
    }

    pub fn set_artboard_guide(
        &mut self,
        node_id: String,
        mode: String,
        count: u32,
        gap: f32,
        color_hex: String,
        opacity: f32,
    ) -> Result<bool, JsValue> {
        let node_id = parse_entity_id(&node_id);
        let color = parse_hex_color(&color_hex)
            .ok_or_else(|| JsValue::from_str("Guide color must be a six-digit hex color"))?;
        let mode = match mode.as_str() {
            "grid" => GuideMode::Grid,
            "columns" => GuideMode::Columns,
            _ => GuideMode::None,
        };
        Ok(self.mutate(|document| {
            document.set_artboard_guide(node_id, mode, count, gap, color, opacity)
        }))
    }

    pub fn add_document_color(
        &mut self,
        name: String,
        color_hex: String,
    ) -> Result<String, JsValue> {
        let color = normalize_hex_color(&color_hex)
            .ok_or_else(|| JsValue::from_str("Document color must be a six-digit hex color"))?;
        Ok(self
            .mutate(|document| document.add_document_color(name, color))
            .to_string())
    }

    pub fn add_number_variable(&mut self, name: String, value: f32) -> String {
        self.mutate(|document| document.add_number_variable(name, value))
            .map_or_else(String::new, |id| id.to_string())
    }

    pub fn update_number_variable(
        &mut self,
        variable_id: String,
        name: String,
        value: f32,
    ) -> bool {
        let variable_id = parse_entity_id(&variable_id);
        self.mutate(|document| document.update_number_variable(variable_id, name, value))
    }

    pub fn delete_number_variable(&mut self, variable_id: String) -> bool {
        let variable_id = parse_entity_id(&variable_id);
        self.mutate(|document| document.delete_number_variable(variable_id))
    }

    pub fn bind_node_variable(
        &mut self,
        node_id: String,
        property: String,
        variable_id: String,
    ) -> bool {
        let node_id = parse_entity_id(&node_id);
        let variable_id = parse_entity_id(&variable_id);
        self.mutate(|document| {
            document.bind_node_variable(
                node_id,
                &property,
                (!variable_id.is_nil()).then_some(variable_id),
            )
        })
    }

    pub fn add_text_style(&mut self, name: String, style_json: &str) -> Result<String, JsValue> {
        let style: TypographyStyle = serde_json::from_str(style_json)
            .map_err(|error| JsValue::from_str(&format!("Invalid text style: {error}")))?;
        Ok(self
            .mutate(|document| document.add_text_style(name, style))
            .to_string())
    }

    pub fn update_text_style(
        &mut self,
        style_id: String,
        name: String,
        style_json: &str,
    ) -> Result<bool, JsValue> {
        let style_id = parse_entity_id(&style_id);
        let style: TypographyStyle = serde_json::from_str(style_json)
            .map_err(|error| JsValue::from_str(&format!("Invalid text style: {error}")))?;
        Ok(self.mutate(|document| document.update_text_style(style_id, name, style)))
    }

    pub fn delete_text_style(&mut self, style_id: String) -> bool {
        let style_id = parse_entity_id(&style_id);
        self.mutate(|document| document.delete_text_style(style_id))
    }

    pub fn bind_node_text_style(&mut self, node_id: String, style_id: String) -> bool {
        let node_id = parse_entity_id(&node_id);
        let style_id = parse_entity_id(&style_id);
        self.mutate(|document| {
            document.bind_node_text_style(node_id, (!style_id.is_nil()).then_some(style_id))
        })
    }

    pub fn align_nodes(&mut self, node_ids_json: &str, alignment: String) -> Result<bool, JsValue> {
        let node_ids: Vec<EntityId> = serde_json::from_str(node_ids_json)
            .map_err(|error| JsValue::from_str(&format!("Invalid node selection: {error}")))?;
        Ok(self.mutate(|document| document.align_nodes(&node_ids, &alignment)))
    }

    pub fn set_node_bounds(
        &mut self,
        node_id: String,
        x: f32,
        y: f32,
        width: f32,
        height: f32,
    ) -> bool {
        let node_id = parse_entity_id(&node_id);
        self.mutate(|document| document.set_node_bounds(node_id, x, y, width, height))
    }

    pub fn begin_transaction(&mut self) {
        if self.transaction_start.is_none() {
            self.transaction_start = Some(self.document.clone());
        }
    }

    pub fn begin_geometry_transaction(&mut self, node_ids_json: &str) -> Result<(), JsValue> {
        if self.transaction_start.is_some() || self.geometry_transaction_start.is_some() {
            return Ok(());
        }
        let node_ids: Vec<EntityId> = serde_json::from_str(node_ids_json)
            .map_err(|error| JsValue::from_str(&format!("Invalid node selection: {error}")))?;
        if self.document.active_page().benchmark_node_count.is_none() {
            self.begin_transaction();
            return Ok(());
        }
        let page_id = self.document.active_page_id;
        let selected: std::collections::HashSet<EntityId> = node_ids.iter().copied().collect();
        let includes_group = node_ids.iter().any(|id| {
            self.document
                .active_node(*id)
                .is_some_and(|node| node.kind == NodeKind::Group)
        });
        let nodes = if includes_group {
            self.document
                .active_page()
                .nodes
                .iter()
                .filter(|node| {
                    if selected.contains(&node.id) {
                        return true;
                    }
                    let mut parent_id = node.parent_id;
                    while let Some(parent) = parent_id {
                        if selected.contains(&parent) {
                            return true;
                        }
                        parent_id = self
                            .document
                            .active_node(parent)
                            .and_then(|ancestor| ancestor.parent_id);
                    }
                    false
                })
                .map(NodeGeometryState::capture)
                .collect()
        } else {
            node_ids
                .iter()
                .filter_map(|id| self.document.active_node(*id))
                .map(NodeGeometryState::capture)
                .collect()
        };
        self.geometry_transaction_start = Some(HistoryEntry::Geometry { page_id, nodes });
        Ok(())
    }

    pub fn end_transaction(&mut self) {
        if let Some(before) = self.transaction_start.take() {
            if component_source_changed(&before, &self.document) {
                self.document.sync_component_instances();
            }
            if before != self.document {
                self.push_undo(HistoryEntry::Document(before));
                self.redo_stack.clear();
            }
        }
        if let Some(entry @ HistoryEntry::Geometry { .. }) = self.geometry_transaction_start.take()
        {
            let changed = match &entry {
                HistoryEntry::Geometry { page_id, nodes } => self
                    .document
                    .pages
                    .iter()
                    .find(|page| page.id == *page_id)
                    .is_some_and(|page| {
                        nodes.iter().any(|before| {
                            page.nodes
                                .iter()
                                .find(|node| node.id == before.id)
                                .is_some_and(|node| NodeGeometryState::capture(node) != *before)
                        })
                    }),
                _ => false,
            };
            if changed {
                self.push_undo(entry);
                self.redo_stack.clear();
            }
        }
    }

    pub fn can_undo(&self) -> bool {
        !self.undo_stack.is_empty()
    }

    pub fn can_redo(&self) -> bool {
        !self.redo_stack.is_empty()
    }

    pub fn undo(&mut self) -> bool {
        self.end_transaction();
        let Some(previous) = self.undo_stack.pop() else {
            return false;
        };
        let before = self.document.clone();
        self.redo_stack.push(previous.apply(&mut self.document));
        if component_source_changed(&before, &self.document) {
            self.document.sync_component_instances();
        }
        true
    }

    pub fn redo(&mut self) -> bool {
        self.end_transaction();
        let Some(next) = self.redo_stack.pop() else {
            return false;
        };
        let before = self.document.clone();
        let inverse = next.apply(&mut self.document);
        if component_source_changed(&before, &self.document) {
            self.document.sync_component_instances();
        }
        self.push_undo(inverse);
        true
    }

    /// Returns the topmost renderable node under a world-space point, or zero.
    pub fn hit_test(&self, x: f32, y: f32) -> String {
        if let Some(hit) = self.document.benchmark_hit_test(x, y) {
            return if hit.is_nil() {
                String::new()
            } else {
                hit.to_string()
            };
        }
        ordered_nodes(self.document.active_page())
            .into_iter()
            .rev()
            .find(|node| {
                node.kind != NodeKind::Group && !node.locked && point_in_rotated_node(node, x, y)
            })
            .map_or_else(String::new, |node| node.id.to_string())
    }

    pub fn load_json(json: &str) -> Result<DocumentEngine, JsValue> {
        console_error_panic_hook::set_once();
        let mut value: serde_json::Value = serde_json::from_str(json)
            .map_err(|error| JsValue::from_str(&format!("Invalid Open Libra document: {error}")))?;
        migrate_legacy_document_ids(&mut value);
        let mut document: Document = serde_json::from_value(value)
            .map_err(|error| JsValue::from_str(&format!("Invalid Open Libra document: {error}")))?;
        document
            .validate()
            .map_err(|error| JsValue::from_str(&error))?;
        document.populate_active_benchmark();
        Ok(Self {
            document,
            undo_stack: Vec::new(),
            redo_stack: Vec::new(),
            transaction_start: None,
            geometry_transaction_start: None,
        })
    }
}

impl DocumentEngine {
    fn mutate<R>(&mut self, operation: impl FnOnce(&mut Document) -> R) -> R {
        if self.transaction_start.is_some() || self.geometry_transaction_start.is_some() {
            return operation(&mut self.document);
        }
        let before = self.document.clone();
        let result = operation(&mut self.document);
        if component_source_changed(&before, &self.document) {
            self.document.sync_component_instances();
        }
        if before != self.document {
            if self.transaction_start.is_none() {
                self.push_undo(HistoryEntry::Document(before));
            }
            self.redo_stack.clear();
        }
        result
    }

    fn push_undo(&mut self, entry: HistoryEntry) {
        const HISTORY_LIMIT: usize = 100;
        if self.undo_stack.len() == HISTORY_LIMIT {
            self.undo_stack.remove(0);
        }
        self.undo_stack.push(entry);
    }
}

fn component_source_changed(before: &Document, after: &Document) -> bool {
    let sources = |document: &Document| {
        document
            .pages
            .iter()
            .flat_map(|page| &page.nodes)
            .filter(|node| {
                node.instance_root_id.is_none() && node.component_slot_id == Some(node.id)
            })
            .map(|node| (node.id, node.clone()))
            .collect::<std::collections::HashMap<_, _>>()
    };
    sources(before) != sources(after)
}

impl Default for DocumentEngine {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests;
