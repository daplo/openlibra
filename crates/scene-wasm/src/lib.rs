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

const SCHEMA_VERSION: u32 = 4;
const FLOATS_PER_RECT: usize = 24;

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
                    .and_then(|page| page.nodes.iter_mut().find(|node| node.id == node_id))
                    .expect("history node exists");
                let inverse = NodeStyleState::capture(node);
                style.apply(node);
                Self::NodeStyle {
                    page_id,
                    node_id,
                    style: inverse,
                }
            }
            Self::Geometry { page_id, nodes } => {
                let page = document
                    .pages
                    .iter_mut()
                    .find(|page| page.id == page_id)
                    .expect("history page exists");
                let mut inverse = Vec::with_capacity(nodes.len());
                for state in nodes {
                    let node = page
                        .nodes
                        .iter_mut()
                        .find(|node| node.id == state.id)
                        .expect("history node exists");
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
        serde_json::to_string_pretty(&self.document).expect("document is serializable")
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

    pub fn set_active_page(&mut self, page_id: String) -> bool {
        self.document.set_active_page(parse_entity_id(&page_id))
    }

    pub fn delete_node(&mut self, node_id: String) -> bool {
        let node_id = parse_entity_id(&node_id);
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
        if let Some(before) = self.transaction_start.take()
            && before != self.document
        {
            self.push_undo(HistoryEntry::Document(before));
            self.redo_stack.clear();
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
        self.redo_stack.push(previous.apply(&mut self.document));
        true
    }

    pub fn redo(&mut self) -> bool {
        self.end_transaction();
        let Some(next) = self.redo_stack.pop() else {
            return false;
        };
        let inverse = next.apply(&mut self.document);
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

impl Default for DocumentEngine {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests;
