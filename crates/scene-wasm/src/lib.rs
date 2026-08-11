use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use wasm_bindgen::prelude::*;

const SCHEMA_VERSION: u32 = 1;
const FLOATS_PER_RECT: usize = 20;

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct Document {
    schema_version: u32,
    next_id: u64,
    active_page_id: u64,
    pages: Vec<Page>,
    #[serde(default)]
    color_library: Vec<ColorAsset>,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct ColorAsset {
    id: u64,
    name: String,
    value: String,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct Page {
    id: u64,
    name: String,
    nodes: Vec<Node>,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct Node {
    id: u64,
    name: String,
    kind: NodeKind,
    parent_id: Option<u64>,
    x: f32,
    y: f32,
    width: f32,
    height: f32,
    fill: [f32; 4],
    stroke: [f32; 4],
    stroke_width: f32,
    corner_radius: f32,
    opacity: f32,
    #[serde(default)]
    rotation: f32,
    #[serde(default)]
    flip_x: bool,
    #[serde(default)]
    flip_y: bool,
    #[serde(default)]
    shadows: Vec<Shadow>,
    #[serde(default)]
    layout_mode: LayoutMode,
    #[serde(default)]
    layout_align: LayoutAlign,
    #[serde(default)]
    layout_justify: LayoutAlign,
    #[serde(default)]
    layout_gap: f32,
    #[serde(default)]
    layout_padding: [f32; 4],
    #[serde(default)]
    width_sizing: LayoutSizing,
    #[serde(default)]
    auto_height: bool,
    #[serde(default)]
    guide_mode: GuideMode,
    #[serde(default = "default_guide_count")]
    guide_count: u32,
    #[serde(default = "default_guide_gap")]
    guide_gap: f32,
    #[serde(default)]
    guide_color: [f32; 4],
    #[serde(default = "default_guide_opacity")]
    guide_opacity: f32,
    locked: bool,
}

#[derive(Clone, Copy, Debug, Default, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum LayoutMode {
    #[default]
    None,
    Row,
    Column,
}

#[derive(Clone, Copy, Debug, Default, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum LayoutAlign {
    #[default]
    Start,
    Center,
    End,
}

#[derive(Clone, Copy, Debug, Default, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum LayoutSizing {
    #[default]
    Fixed,
    Fill,
}

#[derive(Clone, Copy, Debug, Default, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum GuideMode {
    #[default]
    None,
    Grid,
    Columns,
}

fn default_guide_count() -> u32 {
    12
}
fn default_guide_gap() -> f32 {
    16.0
}
fn default_guide_opacity() -> f32 {
    0.12
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct Shadow {
    kind: ShadowKind,
    color: [f32; 4],
    offset_x: f32,
    offset_y: f32,
    blur: f32,
    spread: f32,
    enabled: bool,
}

#[derive(Clone, Copy, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum ShadowKind {
    Outer,
    Inner,
}

#[derive(Clone, Copy, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum NodeKind {
    Frame,
    Rectangle,
    Group,
    Text,
}

#[derive(Serialize)]
struct DocumentReadModel<'a> {
    schema_version: u32,
    active_page_id: u64,
    pages: Vec<PageSummary<'a>>,
    nodes: &'a [Node],
    document_colors: &'a [ColorAsset],
}

#[derive(Serialize)]
struct PageSummary<'a> {
    id: u64,
    name: &'a str,
}

#[wasm_bindgen]
pub struct DocumentEngine {
    document: Document,
    undo_stack: Vec<Document>,
    redo_stack: Vec<Document>,
    transaction_start: Option<Document>,
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
        }
    }

    pub fn scene_data(&self) -> Vec<f32> {
        self.document.scene_data()
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

    pub fn add_rectangle(&mut self) -> u64 {
        self.mutate(|document| document.add_node(NodeKind::Rectangle))
    }

    pub fn add_rectangle_to(&mut self, parent_id: u64) -> u64 {
        self.mutate(|document| document.add_rectangle_to((parent_id != 0).then_some(parent_id)))
    }

    pub fn add_frame(&mut self) -> u64 {
        self.mutate(|document| document.add_node(NodeKind::Frame))
    }

    pub fn add_artboard(&mut self, name: String, width: f32, height: f32) -> Result<u64, JsValue> {
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
        Ok(self.mutate(|document| document.add_artboard(name, width, height)))
    }

    pub fn add_page(&mut self, name: String) -> u64 {
        self.mutate(|document| document.add_page(name))
    }

    pub fn set_active_page(&mut self, page_id: u64) -> bool {
        self.document.set_active_page(page_id)
    }

    pub fn delete_node(&mut self, node_id: u64) -> bool {
        self.mutate(|document| document.delete_node(node_id))
    }

    pub fn rename_node(&mut self, node_id: u64, name: String) -> bool {
        self.mutate(|document| document.rename_node(node_id, name))
    }

    pub fn group_nodes(&mut self, node_ids_json: &str) -> Result<u64, JsValue> {
        let node_ids: Vec<u64> = serde_json::from_str(node_ids_json)
            .map_err(|error| JsValue::from_str(&format!("Invalid node selection: {error}")))?;
        self.mutate(|document| document.group_nodes(&node_ids))
            .ok_or_else(|| {
                JsValue::from_str("At least two existing nodes are required to create a group")
            })
    }

    pub fn move_nodes(&mut self, node_ids_json: &str, dx: f32, dy: f32) -> Result<bool, JsValue> {
        let node_ids: Vec<u64> = serde_json::from_str(node_ids_json)
            .map_err(|error| JsValue::from_str(&format!("Invalid node selection: {error}")))?;
        Ok(self.mutate(|document| document.move_nodes(&node_ids, dx, dy)))
    }

    pub fn reorder_node(&mut self, dragged_id: u64, target_id: u64, before: bool) -> bool {
        self.mutate(|document| document.reorder_node(dragged_id, target_id, before))
    }

    pub fn reparent_nodes_to_artboards(&mut self, node_ids_json: &str) -> Result<bool, JsValue> {
        let node_ids: Vec<u64> = serde_json::from_str(node_ids_json)
            .map_err(|error| JsValue::from_str(&format!("Invalid node selection: {error}")))?;
        Ok(self.mutate(|document| document.reparent_nodes_to_artboards(&node_ids)))
    }

    pub fn set_node_style(
        &mut self,
        node_id: u64,
        fill_hex: String,
        stroke_hex: String,
        stroke_width: f32,
        corner_radius: f32,
    ) -> Result<bool, JsValue> {
        let fill = parse_hex_color(&fill_hex)
            .ok_or_else(|| JsValue::from_str("Fill must be a six-digit hex color"))?;
        let stroke = parse_hex_color(&stroke_hex)
            .ok_or_else(|| JsValue::from_str("Border must be a six-digit hex color"))?;
        Ok(self.mutate(|document| {
            document.set_node_style(node_id, fill, stroke, stroke_width, corner_radius)
        }))
    }

    pub fn resize_node(&mut self, node_id: u64, handle: String, dx: f32, dy: f32) -> bool {
        self.mutate(|document| document.resize_node(node_id, &handle, dx, dy))
    }

    pub fn set_node_locked(&mut self, node_id: u64, locked: bool) -> bool {
        self.mutate(|document| document.set_node_locked(node_id, locked))
    }

    pub fn set_node_opacity(&mut self, node_id: u64, opacity: f32) -> bool {
        self.mutate(|document| document.set_node_opacity(node_id, opacity))
    }

    pub fn set_node_shadows(&mut self, node_id: u64, shadows_json: &str) -> Result<bool, JsValue> {
        let shadows: Vec<Shadow> = serde_json::from_str(shadows_json)
            .map_err(|error| JsValue::from_str(&format!("Invalid shadows: {error}")))?;
        Ok(self.mutate(|document| document.set_node_shadows(node_id, shadows)))
    }

    pub fn set_node_transform(
        &mut self,
        node_id: u64,
        rotation: f32,
        flip_x: bool,
        flip_y: bool,
    ) -> bool {
        self.mutate(|document| document.set_node_transform(node_id, rotation, flip_x, flip_y))
    }

    pub fn set_node_layout(
        &mut self,
        node_id: u64,
        mode: String,
        align: String,
        justify: String,
        gap: f32,
        top: f32,
        right: f32,
        bottom: f32,
        left: f32,
    ) -> bool {
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

    pub fn set_node_width_sizing(&mut self, node_id: u64, sizing: String) -> bool {
        let sizing = if sizing == "fill" {
            LayoutSizing::Fill
        } else {
            LayoutSizing::Fixed
        };
        self.mutate(|document| document.set_node_width_sizing(node_id, sizing))
    }

    pub fn set_node_auto_height(&mut self, node_id: u64, auto_height: bool) -> bool {
        self.mutate(|document| document.set_node_auto_height(node_id, auto_height))
    }

    pub fn set_artboard_guide(
        &mut self,
        node_id: u64,
        mode: String,
        count: u32,
        gap: f32,
        color_hex: String,
        opacity: f32,
    ) -> Result<bool, JsValue> {
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

    pub fn add_document_color(&mut self, name: String, color_hex: String) -> Result<u64, JsValue> {
        let color = normalize_hex_color(&color_hex)
            .ok_or_else(|| JsValue::from_str("Document color must be a six-digit hex color"))?;
        Ok(self.mutate(|document| document.add_document_color(name, color)))
    }

    pub fn align_nodes(&mut self, node_ids_json: &str, alignment: String) -> Result<bool, JsValue> {
        let node_ids: Vec<u64> = serde_json::from_str(node_ids_json)
            .map_err(|error| JsValue::from_str(&format!("Invalid node selection: {error}")))?;
        Ok(self.mutate(|document| document.align_nodes(&node_ids, &alignment)))
    }

    pub fn set_node_bounds(
        &mut self,
        node_id: u64,
        x: f32,
        y: f32,
        width: f32,
        height: f32,
    ) -> bool {
        self.mutate(|document| document.set_node_bounds(node_id, x, y, width, height))
    }

    pub fn begin_transaction(&mut self) {
        if self.transaction_start.is_none() {
            self.transaction_start = Some(self.document.clone());
        }
    }

    pub fn end_transaction(&mut self) {
        let Some(before) = self.transaction_start.take() else {
            return;
        };
        if before != self.document {
            self.push_undo(before);
            self.redo_stack.clear();
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
        self.redo_stack
            .push(std::mem::replace(&mut self.document, previous));
        true
    }

    pub fn redo(&mut self) -> bool {
        self.end_transaction();
        let Some(next) = self.redo_stack.pop() else {
            return false;
        };
        let current = std::mem::replace(&mut self.document, next);
        self.push_undo(current);
        true
    }

    /// Returns the topmost renderable node under a world-space point, or zero.
    pub fn hit_test(&self, x: f32, y: f32) -> u64 {
        ordered_nodes(self.document.active_page())
            .into_iter()
            .rev()
            .find(|node| {
                node.kind != NodeKind::Group
                    && node.kind != NodeKind::Text
                    && !node.locked
                    && point_in_rotated_node(node, x, y)
            })
            .map_or(0, |node| node.id)
    }

    pub fn load_json(json: &str) -> Result<DocumentEngine, JsValue> {
        let document: Document = serde_json::from_str(json)
            .map_err(|error| JsValue::from_str(&format!("Invalid Open Libra document: {error}")))?;
        document
            .validate()
            .map_err(|error| JsValue::from_str(&error))?;
        Ok(Self {
            document,
            undo_stack: Vec::new(),
            redo_stack: Vec::new(),
            transaction_start: None,
        })
    }
}

impl DocumentEngine {
    fn mutate<R>(&mut self, operation: impl FnOnce(&mut Document) -> R) -> R {
        let before = self.document.clone();
        let result = operation(&mut self.document);
        if before != self.document {
            if self.transaction_start.is_none() {
                self.push_undo(before);
            }
            self.redo_stack.clear();
        }
        result
    }

    fn push_undo(&mut self, document: Document) {
        const HISTORY_LIMIT: usize = 100;
        if self.undo_stack.len() == HISTORY_LIMIT {
            self.undo_stack.remove(0);
        }
        self.undo_stack.push(document);
    }
}

impl Default for DocumentEngine {
    fn default() -> Self {
        Self::new()
    }
}

impl Document {
    fn demo() -> Self {
        let mut document = Self {
            schema_version: SCHEMA_VERSION,
            next_id: 2,
            active_page_id: 1,
            pages: vec![Page {
                id: 1,
                name: "Home".into(),
                nodes: Vec::new(),
            }],
            color_library: Vec::new(),
        };

        let mobile = document.insert_node(
            "Mobile app",
            NodeKind::Frame,
            None,
            [80.0, 80.0, 390.0, 760.0],
            [0.96, 0.97, 0.99, 1.0],
        );
        document.insert_node(
            "Navigation",
            NodeKind::Rectangle,
            Some(mobile),
            [104.0, 108.0, 342.0, 64.0],
            [0.10, 0.12, 0.16, 1.0],
        );
        document.insert_node(
            "Hero",
            NodeKind::Rectangle,
            Some(mobile),
            [104.0, 196.0, 342.0, 180.0],
            [0.23, 0.36, 0.78, 1.0],
        );
        document.insert_node(
            "Primary action",
            NodeKind::Rectangle,
            Some(mobile),
            [124.0, 286.0, 110.0, 42.0],
            [0.46, 0.91, 0.72, 1.0],
        );
        document.insert_node(
            "Card A",
            NodeKind::Rectangle,
            Some(mobile),
            [104.0, 400.0, 160.0, 170.0],
            [0.88, 0.90, 0.94, 1.0],
        );
        document.insert_node(
            "Card B",
            NodeKind::Rectangle,
            Some(mobile),
            [286.0, 400.0, 160.0, 170.0],
            [0.88, 0.90, 0.94, 1.0],
        );

        let desktop = document.insert_node(
            "Dashboard",
            NodeKind::Frame,
            None,
            [530.0, 80.0, 820.0, 620.0],
            [0.96, 0.97, 0.99, 1.0],
        );
        document.insert_node(
            "Top bar",
            NodeKind::Rectangle,
            Some(desktop),
            [554.0, 104.0, 772.0, 58.0],
            [0.10, 0.12, 0.16, 1.0],
        );
        document.insert_node(
            "Sidebar",
            NodeKind::Rectangle,
            Some(desktop),
            [554.0, 162.0, 170.0, 514.0],
            [0.90, 0.92, 0.95, 1.0],
        );
        document.insert_node(
            "Metric A",
            NodeKind::Rectangle,
            Some(desktop),
            [748.0, 194.0, 260.0, 110.0],
            [0.23, 0.36, 0.78, 1.0],
        );
        document.insert_node(
            "Metric B",
            NodeKind::Rectangle,
            Some(desktop),
            [1030.0, 194.0, 272.0, 110.0],
            [0.46, 0.91, 0.72, 1.0],
        );
        document.insert_node(
            "Chart",
            NodeKind::Rectangle,
            Some(desktop),
            [748.0, 328.0, 554.0, 220.0],
            [0.88, 0.90, 0.94, 1.0],
        );
        document
    }

    fn active_page(&self) -> &Page {
        self.pages
            .iter()
            .find(|page| page.id == self.active_page_id)
            .expect("active page exists")
    }

    fn active_page_mut(&mut self) -> &mut Page {
        let active = self.active_page_id;
        self.pages
            .iter_mut()
            .find(|page| page.id == active)
            .expect("active page exists")
    }

    fn allocate_id(&mut self) -> u64 {
        let id = self.next_id;
        self.next_id += 1;
        id
    }

    fn insert_node(
        &mut self,
        name: &str,
        kind: NodeKind,
        parent_id: Option<u64>,
        bounds: [f32; 4],
        fill: [f32; 4],
    ) -> u64 {
        let id = self.allocate_id();
        self.active_page_mut().nodes.push(Node {
            id,
            name: name.into(),
            kind,
            parent_id,
            x: bounds[0],
            y: bounds[1],
            width: bounds[2],
            height: bounds[3],
            fill,
            stroke: [0.12, 0.14, 0.18, 1.0],
            stroke_width: 0.0,
            corner_radius: 0.0,
            opacity: 1.0,
            rotation: 0.0,
            flip_x: false,
            flip_y: false,
            shadows: Vec::new(),
            layout_mode: LayoutMode::None,
            layout_align: LayoutAlign::Start,
            layout_justify: LayoutAlign::Start,
            layout_gap: 0.0,
            layout_padding: [0.0; 4],
            width_sizing: LayoutSizing::Fixed,
            auto_height: false,
            guide_mode: GuideMode::None,
            guide_count: default_guide_count(),
            guide_gap: default_guide_gap(),
            guide_color: [0.25, 0.55, 1.0, 1.0],
            guide_opacity: default_guide_opacity(),
            locked: false,
        });
        id
    }

    fn add_node(&mut self, kind: NodeKind) -> u64 {
        let index = self.active_page().nodes.len() as f32;
        let offset = (index % 12.0) * 18.0;
        match kind {
            NodeKind::Frame => self.insert_node(
                "Frame",
                kind,
                None,
                [120.0 + offset, 120.0 + offset, 320.0, 240.0],
                [0.96, 0.97, 0.99, 1.0],
            ),
            _ => self.insert_node(
                "Rectangle",
                kind,
                None,
                [160.0 + offset, 160.0 + offset, 160.0, 100.0],
                [0.46, 0.91, 0.72, 1.0],
            ),
        }
    }

    fn add_rectangle_to(&mut self, parent_id: Option<u64>) -> u64 {
        let parent = parent_id.and_then(|id| {
            self.active_page()
                .nodes
                .iter()
                .find(|node| {
                    node.id == id && matches!(node.kind, NodeKind::Frame | NodeKind::Group)
                })
                .cloned()
        });
        let index = self.active_page().nodes.len() as f32;
        let bounds = parent
            .as_ref()
            .map(|parent| {
                [
                    parent.x + parent.layout_padding[3] + 24.0,
                    parent.y + parent.layout_padding[0] + 24.0,
                    160.0,
                    100.0,
                ]
            })
            .unwrap_or([
                160.0 + (index % 12.0) * 18.0,
                160.0 + (index % 12.0) * 18.0,
                160.0,
                100.0,
            ]);
        let actual_parent = parent.as_ref().map(|parent| parent.id);
        let id = self.insert_node(
            "Rectangle",
            NodeKind::Rectangle,
            actual_parent,
            bounds,
            [0.46, 0.91, 0.72, 1.0],
        );
        if let Some(parent_id) = actual_parent {
            self.relayout_container(parent_id);
        }
        id
    }

    fn add_artboard(&mut self, name: String, width: f32, height: f32) -> u64 {
        let right_edge = self
            .active_page()
            .nodes
            .iter()
            .filter(|node| node.kind == NodeKind::Frame && node.parent_id.is_none())
            .map(|node| node.x + node.width)
            .fold(0.0_f32, f32::max);
        let x = if right_edge == 0.0 {
            80.0
        } else {
            right_edge + 80.0
        };
        self.insert_node(
            &name,
            NodeKind::Frame,
            None,
            [x, 80.0, width, height],
            [0.96, 0.97, 0.99, 1.0],
        )
    }

    fn add_page(&mut self, name: String) -> u64 {
        let id = self.allocate_id();
        self.pages.push(Page {
            id,
            name,
            nodes: Vec::new(),
        });
        self.active_page_id = id;
        id
    }

    fn add_document_color(&mut self, name: String, value: String) -> u64 {
        if let Some(existing) = self.color_library.iter().find(|color| color.value == value) {
            return existing.id;
        }
        let id = self.allocate_id();
        self.color_library.push(ColorAsset {
            id,
            name: if name.trim().is_empty() {
                value.clone()
            } else {
                name.trim().to_owned()
            },
            value,
        });
        id
    }

    fn set_active_page(&mut self, page_id: u64) -> bool {
        if self.pages.iter().any(|page| page.id == page_id) {
            self.active_page_id = page_id;
            true
        } else {
            false
        }
    }

    fn delete_node(&mut self, node_id: u64) -> bool {
        let page = self.active_page_mut();
        if page
            .nodes
            .iter()
            .any(|node| node.id == node_id && node.locked)
        {
            return false;
        }
        let before = page.nodes.len();
        page.nodes
            .retain(|node| node.id != node_id && node.parent_id != Some(node_id));
        page.nodes.len() != before
    }

    fn rename_node(&mut self, node_id: u64, name: String) -> bool {
        if let Some(node) = self
            .active_page_mut()
            .nodes
            .iter_mut()
            .find(|node| node.id == node_id)
        {
            if node.locked {
                return false;
            }
            node.name = name;
            true
        } else {
            false
        }
    }

    fn group_nodes(&mut self, node_ids: &[u64]) -> Option<u64> {
        let unique: HashSet<u64> = node_ids.iter().copied().collect();
        if unique.len() < 2 {
            return None;
        }

        let selected: Vec<_> = self
            .active_page()
            .nodes
            .iter()
            .filter(|node| unique.contains(&node.id))
            .cloned()
            .collect();
        if selected.len() < 2 || selected.iter().any(|node| node.locked) {
            return None;
        }
        let min_x = selected
            .iter()
            .map(|node| node.x)
            .fold(f32::INFINITY, f32::min);
        let min_y = selected
            .iter()
            .map(|node| node.y)
            .fold(f32::INFINITY, f32::min);
        let max_x = selected
            .iter()
            .map(|node| node.x + node.width)
            .fold(f32::NEG_INFINITY, f32::max);
        let max_y = selected
            .iter()
            .map(|node| node.y + node.height)
            .fold(f32::NEG_INFINITY, f32::max);
        let parent_id = selected.first().and_then(|first| {
            selected
                .iter()
                .all(|node| node.parent_id == first.parent_id)
                .then_some(first.parent_id)
                .flatten()
        });
        let group_id = self.insert_node(
            "Group",
            NodeKind::Group,
            parent_id,
            [min_x, min_y, max_x - min_x, max_y - min_y],
            [0.0; 4],
        );
        for node in &mut self.active_page_mut().nodes {
            if unique.contains(&node.id) {
                node.parent_id = Some(group_id);
            }
        }
        Some(group_id)
    }

    fn move_nodes(&mut self, node_ids: &[u64], dx: f32, dy: f32) -> bool {
        let roots: HashSet<u64> = node_ids.iter().copied().collect();
        if roots.is_empty() {
            return false;
        }
        let nodes = &self.active_page().nodes;
        if nodes
            .iter()
            .any(|node| roots.contains(&node.id) && node.locked)
        {
            return false;
        }
        let mut moving = roots.clone();
        loop {
            let before = moving.len();
            for node in nodes {
                if node
                    .parent_id
                    .is_some_and(|parent| moving.contains(&parent))
                {
                    moving.insert(node.id);
                }
            }
            if moving.len() == before {
                break;
            }
        }
        let mut changed = false;
        for node in &mut self.active_page_mut().nodes {
            if moving.contains(&node.id) {
                node.x += dx;
                node.y += dy;
                changed = true;
            }
        }
        changed
    }

    fn set_node_style(
        &mut self,
        node_id: u64,
        fill: [f32; 4],
        stroke: [f32; 4],
        stroke_width: f32,
        corner_radius: f32,
    ) -> bool {
        let Some(node) = self
            .active_page_mut()
            .nodes
            .iter_mut()
            .find(|node| node.id == node_id)
        else {
            return false;
        };
        if node.locked {
            return false;
        }
        node.fill = fill;
        node.stroke = stroke;
        node.stroke_width = stroke_width.clamp(0.0, 100.0);
        node.corner_radius = corner_radius.clamp(0.0, node.width.min(node.height) / 2.0);
        true
    }

    fn resize_node(&mut self, node_id: u64, handle: &str, dx: f32, dy: f32) -> bool {
        let Some(node) = self
            .active_page_mut()
            .nodes
            .iter_mut()
            .find(|node| node.id == node_id)
        else {
            return false;
        };
        if node.locked {
            return false;
        }
        let min_size = 8.0;
        let old_center = (node.x + node.width / 2.0, node.y + node.height / 2.0);
        let old_right = node.x + node.width;
        let old_bottom = node.y + node.height;
        let fixed_before_local = (
            if handle.contains('w') {
                old_right
            } else if handle.contains('e') {
                node.x
            } else {
                old_center.0
            },
            if handle.contains('n') {
                old_bottom
            } else if handle.contains('s') {
                node.y
            } else {
                old_center.1
            },
        );
        let fixed_before =
            rotate_around(fixed_before_local, old_center, node.rotation.to_radians());
        if handle.contains('w') {
            node.x = (node.x + dx).min(old_right - min_size);
            node.width = old_right - node.x;
        }
        if handle.contains('e') {
            node.width = (node.width + dx).max(min_size);
        }
        if handle.contains('n') {
            node.y = (node.y + dy).min(old_bottom - min_size);
            node.height = old_bottom - node.y;
        }
        if handle.contains('s') {
            node.height = (node.height + dy).max(min_size);
        }
        let new_center = (node.x + node.width / 2.0, node.y + node.height / 2.0);
        let fixed_after_local = (
            if handle.contains('w') {
                node.x + node.width
            } else if handle.contains('e') {
                node.x
            } else {
                new_center.0
            },
            if handle.contains('n') {
                node.y + node.height
            } else if handle.contains('s') {
                node.y
            } else {
                new_center.1
            },
        );
        let fixed_after = rotate_around(fixed_after_local, new_center, node.rotation.to_radians());
        node.x += fixed_before.0 - fixed_after.0;
        node.y += fixed_before.1 - fixed_after.1;
        node.corner_radius = node.corner_radius.min(node.width.min(node.height) / 2.0);
        let parent_id = node.parent_id;
        let relayout_self = node.auto_height && node.layout_mode != LayoutMode::None;
        if relayout_self {
            self.relayout_container(node_id);
        }
        if let Some(parent_id) = parent_id {
            self.relayout_container(parent_id);
        }
        true
    }

    fn set_node_locked(&mut self, node_id: u64, locked: bool) -> bool {
        let Some(node) = self
            .active_page_mut()
            .nodes
            .iter_mut()
            .find(|node| node.id == node_id)
        else {
            return false;
        };
        node.locked = locked;
        true
    }

    fn set_node_opacity(&mut self, node_id: u64, opacity: f32) -> bool {
        if !opacity.is_finite() {
            return false;
        }
        let Some(node) = self
            .active_page_mut()
            .nodes
            .iter_mut()
            .find(|node| node.id == node_id)
        else {
            return false;
        };
        if node.locked {
            return false;
        }
        node.opacity = opacity.clamp(0.0, 1.0);
        true
    }

    fn set_node_shadows(&mut self, node_id: u64, mut shadows: Vec<Shadow>) -> bool {
        let Some(node) = self
            .active_page_mut()
            .nodes
            .iter_mut()
            .find(|node| node.id == node_id)
        else {
            return false;
        };
        if node.locked || shadows.len() > 16 {
            return false;
        }
        for shadow in &mut shadows {
            if !shadow.offset_x.is_finite()
                || !shadow.offset_y.is_finite()
                || !shadow.blur.is_finite()
                || !shadow.spread.is_finite()
                || shadow.color.iter().any(|value| !value.is_finite())
            {
                return false;
            }
            shadow.offset_x = shadow.offset_x.clamp(-1000.0, 1000.0);
            shadow.offset_y = shadow.offset_y.clamp(-1000.0, 1000.0);
            shadow.blur = shadow.blur.clamp(0.0, 500.0);
            shadow.spread = shadow.spread.clamp(-500.0, 500.0);
            for channel in &mut shadow.color {
                *channel = channel.clamp(0.0, 1.0);
            }
        }
        node.shadows = shadows;
        true
    }

    fn set_node_transform(
        &mut self,
        node_id: u64,
        rotation: f32,
        flip_x: bool,
        flip_y: bool,
    ) -> bool {
        if !rotation.is_finite() {
            return false;
        }
        let Some(node) = self
            .active_page_mut()
            .nodes
            .iter_mut()
            .find(|node| node.id == node_id)
        else {
            return false;
        };
        if node.locked {
            return false;
        }
        node.rotation = rotation.rem_euclid(360.0);
        node.flip_x = flip_x;
        node.flip_y = flip_y;
        true
    }

    fn set_node_layout(
        &mut self,
        node_id: u64,
        mode: LayoutMode,
        align: LayoutAlign,
        justify: LayoutAlign,
        gap: f32,
        padding: [f32; 4],
    ) -> bool {
        if !gap.is_finite() || padding.iter().any(|value| !value.is_finite()) {
            return false;
        }
        let Some(container) = self
            .active_page_mut()
            .nodes
            .iter_mut()
            .find(|node| node.id == node_id)
        else {
            return false;
        };
        if container.locked || !matches!(container.kind, NodeKind::Frame | NodeKind::Group) {
            return false;
        }
        container.layout_mode = mode;
        container.layout_align = align;
        container.layout_justify = justify;
        container.layout_gap = gap.clamp(0.0, 1000.0);
        container.layout_padding = padding.map(|value| value.clamp(0.0, 1000.0));
        self.relayout_container(node_id);
        true
    }

    fn set_node_width_sizing(&mut self, node_id: u64, sizing: LayoutSizing) -> bool {
        let parent_id = {
            let Some(node) = self
                .active_page_mut()
                .nodes
                .iter_mut()
                .find(|node| node.id == node_id)
            else {
                return false;
            };
            if node.locked {
                return false;
            }
            node.width_sizing = sizing;
            node.parent_id
        };
        if let Some(parent_id) = parent_id {
            self.relayout_container(parent_id);
        }
        true
    }

    fn set_node_auto_height(&mut self, node_id: u64, auto_height: bool) -> bool {
        let Some(node) = self
            .active_page_mut()
            .nodes
            .iter_mut()
            .find(|node| node.id == node_id)
        else {
            return false;
        };
        if node.locked
            || !matches!(node.kind, NodeKind::Frame | NodeKind::Group)
            || node.layout_mode == LayoutMode::None
        {
            return false;
        }
        node.auto_height = auto_height;
        self.relayout_container(node_id);
        true
    }

    fn set_artboard_guide(
        &mut self,
        node_id: u64,
        mode: GuideMode,
        count: u32,
        gap: f32,
        color: [f32; 4],
        opacity: f32,
    ) -> bool {
        if !gap.is_finite() || !opacity.is_finite() {
            return false;
        }
        let Some(node) = self
            .active_page_mut()
            .nodes
            .iter_mut()
            .find(|node| node.id == node_id)
        else {
            return false;
        };
        if node.locked || node.kind != NodeKind::Frame {
            return false;
        }
        node.guide_mode = mode;
        node.guide_count = count.clamp(1, 64);
        node.guide_gap = gap.clamp(1.0, 1000.0);
        node.guide_color = color;
        node.guide_opacity = opacity.clamp(0.0, 1.0);
        true
    }

    fn relayout_container(&mut self, node_id: u64) {
        let Some(mut container) = self
            .active_page()
            .nodes
            .iter()
            .find(|node| node.id == node_id)
            .cloned()
        else {
            return;
        };
        if container.layout_mode == LayoutMode::None {
            return;
        }
        let [top, right, bottom, left] = container.layout_padding;
        let children: Vec<(u64, f32, f32, LayoutSizing)> = self
            .active_page()
            .nodes
            .iter()
            .filter(|node| node.parent_id == Some(node_id))
            .map(|node| (node.id, node.width, node.height, node.width_sizing))
            .collect();
        let gaps = container.layout_gap * children.len().saturating_sub(1) as f32;
        if container.auto_height {
            let content_height = if container.layout_mode == LayoutMode::Row {
                children
                    .iter()
                    .map(|(_, _, height, _)| *height)
                    .fold(0.0_f32, f32::max)
            } else {
                children
                    .iter()
                    .map(|(_, _, height, _)| *height)
                    .sum::<f32>()
                    + gaps
            };
            container.height = (top + content_height + bottom).max(8.0);
            if let Some(stored) = self
                .active_page_mut()
                .nodes
                .iter_mut()
                .find(|node| node.id == node_id)
            {
                stored.height = container.height;
            }
        }
        let cross_width = (container.width - left - right).max(0.0);
        let cross_height = (container.height - top - bottom).max(0.0);
        let available_main = if container.layout_mode == LayoutMode::Row {
            cross_width
        } else {
            cross_height
        };
        let fill_count = children
            .iter()
            .filter(|(_, _, _, sizing)| *sizing == LayoutSizing::Fill)
            .count();
        let fixed_width = children
            .iter()
            .filter(|(_, _, _, sizing)| *sizing == LayoutSizing::Fixed)
            .map(|(_, width, _, _)| *width)
            .sum::<f32>();
        let fill_width = if container.layout_mode == LayoutMode::Row && fill_count > 0 {
            ((cross_width - fixed_width - gaps) / fill_count as f32).max(8.0)
        } else {
            cross_width.max(8.0)
        };
        let content_size = if container.layout_mode == LayoutMode::Row {
            fixed_width + fill_width * fill_count as f32 + gaps
        } else {
            children
                .iter()
                .map(|(_, _, height, _)| *height)
                .sum::<f32>()
                + gaps
        };
        let main_offset = match container.layout_justify {
            LayoutAlign::Start => 0.0,
            LayoutAlign::Center => (available_main - content_size) / 2.0,
            LayoutAlign::End => available_main - content_size,
        };
        let mut cursor = if container.layout_mode == LayoutMode::Row {
            container.x + left + main_offset
        } else {
            container.y + top + main_offset
        };
        let page = self.active_page_mut();
        for (child_id, _, _, sizing) in children {
            let Some(child) = page.nodes.iter_mut().find(|node| node.id == child_id) else {
                continue;
            };
            if container.layout_mode == LayoutMode::Row {
                if sizing == LayoutSizing::Fill {
                    child.width = fill_width;
                }
                child.x = cursor;
                child.y = container.y
                    + top
                    + match container.layout_align {
                        LayoutAlign::Start => 0.0,
                        LayoutAlign::Center => (cross_height - child.height) / 2.0,
                        LayoutAlign::End => cross_height - child.height,
                    };
                cursor += child.width + container.layout_gap;
            } else {
                if sizing == LayoutSizing::Fill {
                    child.width = fill_width;
                }
                child.y = cursor;
                child.x = container.x
                    + left
                    + match container.layout_align {
                        LayoutAlign::Start => 0.0,
                        LayoutAlign::Center => (cross_width - child.width) / 2.0,
                        LayoutAlign::End => cross_width - child.width,
                    };
                cursor += child.height + container.layout_gap;
            }
        }
    }

    fn align_nodes(&mut self, node_ids: &[u64], alignment: &str) -> bool {
        let ids: HashSet<u64> = node_ids.iter().copied().collect();
        let selected: Vec<_> = self
            .active_page()
            .nodes
            .iter()
            .filter(|node| ids.contains(&node.id) && !node.locked)
            .cloned()
            .collect();
        if selected.len() < 2 {
            return false;
        }
        let min_x = selected
            .iter()
            .map(|node| node.x)
            .fold(f32::INFINITY, f32::min);
        let min_y = selected
            .iter()
            .map(|node| node.y)
            .fold(f32::INFINITY, f32::min);
        let max_x = selected
            .iter()
            .map(|node| node.x + node.width)
            .fold(f32::NEG_INFINITY, f32::max);
        let max_y = selected
            .iter()
            .map(|node| node.y + node.height)
            .fold(f32::NEG_INFINITY, f32::max);
        for node in &mut self.active_page_mut().nodes {
            if !ids.contains(&node.id) || node.locked {
                continue;
            }
            match alignment {
                "left" => node.x = min_x,
                "center-x" => node.x = (min_x + max_x - node.width) / 2.0,
                "right" => node.x = max_x - node.width,
                "top" => node.y = min_y,
                "center-y" => node.y = (min_y + max_y - node.height) / 2.0,
                "bottom" => node.y = max_y - node.height,
                _ => return false,
            }
        }
        true
    }

    fn set_node_bounds(&mut self, node_id: u64, x: f32, y: f32, width: f32, height: f32) -> bool {
        if ![x, y, width, height].iter().all(|value| value.is_finite()) {
            return false;
        }
        let Some(node) = self
            .active_page_mut()
            .nodes
            .iter_mut()
            .find(|node| node.id == node_id)
        else {
            return false;
        };
        if node.locked {
            return false;
        }
        node.x = x;
        node.y = y;
        node.width = width.max(8.0);
        node.height = height.max(8.0);
        node.corner_radius = node.corner_radius.min(node.width.min(node.height) / 2.0);
        let parent_id = node.parent_id;
        let relayout_self = node.auto_height && node.layout_mode != LayoutMode::None;
        if relayout_self {
            self.relayout_container(node_id);
        }
        if let Some(parent_id) = parent_id {
            self.relayout_container(parent_id);
        }
        true
    }

    fn reorder_node(&mut self, dragged_id: u64, target_id: u64, before: bool) -> bool {
        if dragged_id == target_id {
            return false;
        }
        let page = self.active_page();
        let Some(dragged_index) = page.nodes.iter().position(|node| node.id == dragged_id) else {
            return false;
        };
        if page.nodes[dragged_index].locked {
            return false;
        }
        let Some(target) = page.nodes.iter().find(|node| node.id == target_id) else {
            return false;
        };
        let target_parent = target.parent_id;

        // A group cannot become its own descendant through a sibling-level drop.
        let mut ancestor = target_parent;
        while let Some(ancestor_id) = ancestor {
            if ancestor_id == dragged_id {
                return false;
            }
            ancestor = page
                .nodes
                .iter()
                .find(|node| node.id == ancestor_id)
                .and_then(|node| node.parent_id);
        }

        let page = self.active_page_mut();
        let mut dragged = page.nodes.remove(dragged_index);
        dragged.parent_id = target_parent;
        let Some(mut insertion) = page.nodes.iter().position(|node| node.id == target_id) else {
            return false;
        };
        if !before {
            insertion += 1;
        }
        page.nodes.insert(insertion, dragged);
        true
    }

    fn reparent_nodes_to_artboards(&mut self, node_ids: &[u64]) -> bool {
        let selected: HashSet<u64> = node_ids.iter().copied().collect();
        let artboards: Vec<Node> = self
            .active_page()
            .nodes
            .iter()
            .filter(|node| {
                node.kind == NodeKind::Frame
                    && node.parent_id.is_none()
                    && !selected.contains(&node.id)
            })
            .cloned()
            .collect();
        let changes: Vec<(u64, Option<u64>, Option<u64>)> = self
            .active_page()
            .nodes
            .iter()
            .filter(|node| {
                selected.contains(&node.id) && node.kind != NodeKind::Frame && !node.locked
            })
            .filter_map(|node| {
                let center = (node.x + node.width / 2.0, node.y + node.height / 2.0);
                let target = artboards
                    .iter()
                    .rev()
                    .find(|artboard| point_in_rotated_node(artboard, center.0, center.1))
                    .map(|artboard| artboard.id);
                (target != node.parent_id).then_some((node.id, node.parent_id, target))
            })
            .collect();
        if changes.is_empty() {
            return false;
        }
        for (node_id, _, target) in &changes {
            if let Some(node) = self
                .active_page_mut()
                .nodes
                .iter_mut()
                .find(|node| node.id == *node_id)
            {
                node.parent_id = *target;
            }
        }
        let affected: HashSet<u64> = changes
            .iter()
            .flat_map(|(_, old, new)| [*old, *new])
            .flatten()
            .collect();
        for parent_id in affected {
            self.relayout_container(parent_id);
        }
        true
    }

    fn scene_data(&self) -> Vec<f32> {
        let mut scene = Vec::new();
        for node in ordered_nodes(self.active_page()) {
            if node.kind != NodeKind::Group && node.kind != NodeKind::Text {
                for shadow in node
                    .shadows
                    .iter()
                    .filter(|shadow| shadow.enabled && shadow.kind == ShadowKind::Outer)
                {
                    let feather = shadow.blur.max(0.5) * 2.0;
                    scene.extend_from_slice(&[
                        node.x + shadow.offset_x - shadow.spread - feather,
                        node.y + shadow.offset_y - shadow.spread - feather,
                        node.width + shadow.spread * 2.0 + feather * 2.0,
                        node.height + shadow.spread * 2.0 + feather * 2.0,
                    ]);
                    scene.extend_from_slice(&shadow.color);
                    scene.extend_from_slice(&[feather, shadow.blur.max(0.5), 0.0, 0.0]);
                    scene.extend_from_slice(&[
                        (node.corner_radius + shadow.spread).max(0.0),
                        0.0,
                        node.opacity,
                        1.0,
                    ]);
                    scene.extend_from_slice(&node_transform(node));
                }
                scene.extend_from_slice(&[node.x, node.y, node.width, node.height]);
                scene.extend_from_slice(&node.fill);
                scene.extend_from_slice(&node.stroke);
                scene.extend_from_slice(&[
                    node.corner_radius,
                    node.stroke_width,
                    node.opacity,
                    0.0,
                ]);
                scene.extend_from_slice(&node_transform(node));
                for shadow in node
                    .shadows
                    .iter()
                    .filter(|shadow| shadow.enabled && shadow.kind == ShadowKind::Inner)
                {
                    scene.extend_from_slice(&[node.x, node.y, node.width, node.height]);
                    scene.extend_from_slice(&shadow.color);
                    scene.extend_from_slice(&[
                        shadow.offset_x,
                        shadow.offset_y,
                        shadow.blur.max(0.5),
                        shadow.spread,
                    ]);
                    scene.extend_from_slice(&[node.corner_radius, 0.0, node.opacity, 2.0]);
                    scene.extend_from_slice(&node_transform(node));
                }
            }
        }
        scene
    }

    fn read_model(&self) -> DocumentReadModel<'_> {
        DocumentReadModel {
            schema_version: self.schema_version,
            active_page_id: self.active_page_id,
            pages: self
                .pages
                .iter()
                .map(|page| PageSummary {
                    id: page.id,
                    name: &page.name,
                })
                .collect(),
            nodes: &self.active_page().nodes,
            document_colors: &self.color_library,
        }
    }

    fn validate(&self) -> Result<(), String> {
        if self.schema_version != SCHEMA_VERSION {
            return Err(format!(
                "Unsupported schema version {}",
                self.schema_version
            ));
        }
        if !self.pages.iter().any(|page| page.id == self.active_page_id) {
            return Err("Active page does not exist".into());
        }
        for page in &self.pages {
            for node in &page.nodes {
                if let Some(parent_id) = node.parent_id {
                    if !page.nodes.iter().any(|parent| parent.id == parent_id) {
                        return Err(format!("Node {} has a missing parent", node.id));
                    }
                }
            }
        }
        Ok(())
    }
}

fn ordered_nodes(page: &Page) -> Vec<&Node> {
    fn append_children<'a>(nodes: &'a [Node], parent_id: Option<u64>, ordered: &mut Vec<&'a Node>) {
        for node in nodes.iter().filter(|node| node.parent_id == parent_id) {
            ordered.push(node);
            append_children(nodes, Some(node.id), ordered);
        }
    }
    let mut ordered = Vec::with_capacity(page.nodes.len());
    append_children(&page.nodes, None, &mut ordered);
    ordered
}

fn point_in_rotated_node(node: &Node, x: f32, y: f32) -> bool {
    let center_x = node.x + node.width / 2.0;
    let center_y = node.y + node.height / 2.0;
    let angle = -node.rotation.to_radians();
    let dx = x - center_x;
    let dy = y - center_y;
    let local_x = dx * angle.cos() - dy * angle.sin() + center_x;
    let local_y = dx * angle.sin() + dy * angle.cos() + center_y;
    local_x >= node.x
        && local_y >= node.y
        && local_x <= node.x + node.width
        && local_y <= node.y + node.height
}

fn rotate_around(point: (f32, f32), center: (f32, f32), angle: f32) -> (f32, f32) {
    let dx = point.0 - center.0;
    let dy = point.1 - center.1;
    (
        center.0 + dx * angle.cos() - dy * angle.sin(),
        center.1 + dx * angle.sin() + dy * angle.cos(),
    )
}

fn node_transform(node: &Node) -> [f32; 4] {
    [
        node.rotation.to_radians(),
        if node.flip_x { -1.0 } else { 1.0 },
        if node.flip_y { -1.0 } else { 1.0 },
        0.0,
    ]
}

fn parse_hex_color(value: &str) -> Option<[f32; 4]> {
    let normalized = normalize_hex_color(value)?;
    let hex = normalized.strip_prefix('#')?;
    if hex.len() != 6 || !hex.as_bytes().iter().all(u8::is_ascii_hexdigit) {
        return None;
    }
    let red = u8::from_str_radix(&hex[0..2], 16).ok()?;
    let green = u8::from_str_radix(&hex[2..4], 16).ok()?;
    let blue = u8::from_str_radix(&hex[4..6], 16).ok()?;
    Some([
        red as f32 / 255.0,
        green as f32 / 255.0,
        blue as f32 / 255.0,
        1.0,
    ])
}

fn normalize_hex_color(value: &str) -> Option<String> {
    let hex = value.trim().strip_prefix('#').unwrap_or(value.trim());
    if hex.len() != 6 || !hex.as_bytes().iter().all(u8::is_ascii_hexdigit) {
        return None;
    }
    Some(format!("#{}", hex.to_ascii_uppercase()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn demo_document_has_stable_renderable_nodes() {
        let engine = DocumentEngine::new();
        assert_eq!(engine.rect_count(), 12);
        assert_eq!(engine.scene_data().len(), 12 * FLOATS_PER_RECT);
    }

    #[test]
    fn document_round_trip_is_lossless() {
        let mut engine = DocumentEngine::new();
        engine.add_page("Checkout".into());
        engine.add_frame();
        engine.add_rectangle();
        let json = engine.document_json();
        let decoded: Document = serde_json::from_str(&json).unwrap();
        assert_eq!(decoded, engine.document);
        decoded.validate().unwrap();
    }

    #[test]
    fn deleting_a_frame_removes_its_direct_children() {
        let mut document = Document::demo();
        let frame = document.active_page().nodes[0].id;
        assert!(document.delete_node(frame));
        assert!(
            !document
                .active_page()
                .nodes
                .iter()
                .any(|node| node.parent_id == Some(frame))
        );
    }

    #[test]
    fn page_switching_changes_the_render_scene() {
        let mut document = Document::demo();
        let page = document.add_page("Empty".into());
        assert!(document.scene_data().is_empty());
        document.add_node(NodeKind::Rectangle);
        assert_eq!(document.scene_data().len(), FLOATS_PER_RECT);
        assert!(document.set_active_page(1));
        assert_ne!(document.active_page_id, page);
    }

    #[test]
    fn a_group_moves_its_children_as_one_unit() {
        let mut document = Document::demo();
        let ids = [
            document.active_page().nodes[1].id,
            document.active_page().nodes[2].id,
        ];
        let before = document.active_page().nodes[1].x;
        let group = document.group_nodes(&ids).unwrap();
        assert!(document.move_nodes(&[group], 25.0, -10.0));
        assert_eq!(document.active_page().nodes[1].x, before + 25.0);
        assert!(
            document
                .active_page()
                .nodes
                .iter()
                .filter(|node| ids.contains(&node.id))
                .all(|node| node.parent_id == Some(group))
        );
    }

    #[test]
    fn layers_can_be_reordered_above_and_below_siblings() {
        let mut document = Document::demo();
        let first = document.active_page().nodes[1].id;
        let second = document.active_page().nodes[2].id;
        assert!(document.reorder_node(first, second, false));
        let page = document.active_page();
        let first_index = page.nodes.iter().position(|node| node.id == first).unwrap();
        let second_index = page
            .nodes
            .iter()
            .position(|node| node.id == second)
            .unwrap();
        assert_eq!(first_index, second_index + 1);
        assert_eq!(
            page.nodes[first_index].parent_id,
            page.nodes[second_index].parent_id
        );
    }

    #[test]
    fn hit_testing_returns_the_topmost_node() {
        let engine = DocumentEngine::new();
        let hit = engine.hit_test(130.0, 210.0);
        let expected = engine
            .document
            .active_page()
            .nodes
            .iter()
            .rev()
            .find(|node| {
                130.0 >= node.x
                    && 210.0 >= node.y
                    && 130.0 <= node.x + node.width
                    && 210.0 <= node.y + node.height
            })
            .unwrap();
        assert_eq!(hit, expected.id);
        assert_eq!(engine.hit_test(-100.0, -100.0), 0);
    }

    #[test]
    fn artboards_use_requested_dimensions_and_do_not_overlap() {
        let mut document = Document::demo();
        let first = document.add_artboard("Mobile 390".into(), 390.0, 844.0);
        let second = document.add_artboard("Desktop 1440".into(), 1440.0, 900.0);
        let first = document
            .active_page()
            .nodes
            .iter()
            .find(|node| node.id == first)
            .unwrap();
        let second = document
            .active_page()
            .nodes
            .iter()
            .find(|node| node.id == second)
            .unwrap();
        assert_eq!((first.width, first.height), (390.0, 844.0));
        assert!(second.x >= first.x + first.width + 80.0);
    }

    #[test]
    fn node_styles_are_clamped_and_serialized() {
        let mut document = Document::demo();
        let id = document.active_page().nodes[1].id;
        assert!(document.set_node_style(
            id,
            [1.0, 0.0, 0.5, 1.0],
            [0.0, 0.0, 0.0, 1.0],
            4.0,
            1_000.0
        ));
        let node = document
            .active_page()
            .nodes
            .iter()
            .find(|node| node.id == id)
            .unwrap();
        assert_eq!(node.stroke_width, 4.0);
        assert_eq!(node.corner_radius, node.width.min(node.height) / 2.0);
        assert!(
            serde_json::to_string(&document)
                .unwrap()
                .contains("corner_radius")
        );
    }

    #[test]
    fn corner_resize_updates_bounds_and_enforces_minimum_size() {
        let mut document = Document::demo();
        let id = document.active_page().nodes[1].id;
        let before = document.active_page().nodes[1].clone();
        assert!(document.resize_node(id, "se", 20.0, 15.0));
        let node = document
            .active_page()
            .nodes
            .iter()
            .find(|node| node.id == id)
            .unwrap();
        assert_eq!(node.width, before.width + 20.0);
        assert_eq!(node.height, before.height + 15.0);
        assert!(document.resize_node(id, "nw", 10_000.0, 10_000.0));
        let node = document
            .active_page()
            .nodes
            .iter()
            .find(|node| node.id == id)
            .unwrap();
        assert_eq!((node.width, node.height), (8.0, 8.0));
    }

    #[test]
    fn numeric_bounds_are_editable_and_validated() {
        let mut document = Document::demo();
        let id = document.active_page().nodes[1].id;
        assert!(document.set_node_bounds(id, -24.0, 42.0, 200.0, 3.0));
        let node = document
            .active_page()
            .nodes
            .iter()
            .find(|node| node.id == id)
            .unwrap();
        assert_eq!(
            (node.x, node.y, node.width, node.height),
            (-24.0, 42.0, 200.0, 8.0)
        );
        assert!(!document.set_node_bounds(id, f32::NAN, 0.0, 10.0, 10.0));
    }

    #[test]
    fn locked_nodes_reject_edits_and_canvas_hit_testing() {
        let mut engine = DocumentEngine::new();
        let id = engine.document.active_page().nodes[2].id;
        let point = {
            let node = engine
                .document
                .active_page()
                .nodes
                .iter()
                .find(|node| node.id == id)
                .unwrap();
            (node.x + 2.0, node.y + 2.0)
        };
        assert!(engine.set_node_locked(id, true));
        assert!(!engine.document.move_nodes(&[id], 10.0, 10.0));
        assert!(!engine.document.resize_node(id, "se", 10.0, 10.0));
        assert_ne!(engine.hit_test(point.0, point.1), id);
        assert!(engine.set_node_locked(id, false));
        assert!(engine.document.move_nodes(&[id], 10.0, 10.0));
    }

    #[test]
    fn opacity_is_clamped_and_locked_nodes_reject_changes() {
        let mut document = Document::demo();
        let id = document.active_page().nodes[1].id;
        assert!(document.set_node_opacity(id, 1.5));
        assert_eq!(document.active_page().nodes[1].opacity, 1.0);
        assert!(document.set_node_opacity(id, -0.2));
        assert_eq!(document.active_page().nodes[1].opacity, 0.0);
        assert!(document.set_node_locked(id, true));
        assert!(!document.set_node_opacity(id, 0.5));
    }

    #[test]
    fn multiple_outer_and_inner_shadows_are_serialized_and_rendered() {
        let mut document = Document::demo();
        let id = document.active_page().nodes[1].id;
        let base_rects = document.scene_data().len() / FLOATS_PER_RECT;
        let shadows = vec![
            Shadow {
                kind: ShadowKind::Outer,
                color: [0.0, 0.0, 0.0, 0.25],
                offset_x: 0.0,
                offset_y: 8.0,
                blur: 16.0,
                spread: 0.0,
                enabled: true,
            },
            Shadow {
                kind: ShadowKind::Inner,
                color: [0.0, 0.0, 0.0, 0.4],
                offset_x: 0.0,
                offset_y: 2.0,
                blur: 4.0,
                spread: 0.0,
                enabled: true,
            },
        ];
        assert!(document.set_node_shadows(id, shadows.clone()));
        assert_eq!(document.active_page().nodes[1].shadows, shadows);
        assert_eq!(
            document.scene_data().len() / FLOATS_PER_RECT,
            base_rects + 2
        );
        let json = serde_json::to_string(&document).unwrap();
        let restored: Document = serde_json::from_str(&json).unwrap();
        assert_eq!(restored.active_page().nodes[1].shadows.len(), 2);
    }

    #[test]
    fn rotation_and_flips_are_normalized_and_persisted() {
        let mut document = Document::demo();
        let id = document.active_page().nodes[1].id;
        assert!(document.set_node_transform(id, 450.0, true, true));
        let node = &document.active_page().nodes[1];
        assert_eq!(node.rotation, 90.0);
        assert!(node.flip_x && node.flip_y);
        let json = serde_json::to_string(&document).unwrap();
        let restored: Document = serde_json::from_str(&json).unwrap();
        assert_eq!(restored.active_page().nodes[1].rotation, 90.0);
    }

    #[test]
    fn resizing_a_rotated_node_keeps_the_opposite_visual_corner_fixed() {
        let mut document = Document::demo();
        let id = document.active_page().nodes[1].id;
        assert!(document.set_node_transform(id, 180.0, false, false));
        let before = document.active_page().nodes[1].clone();
        let fixed_before = rotate_around(
            (before.x, before.y),
            (
                before.x + before.width / 2.0,
                before.y + before.height / 2.0,
            ),
            before.rotation.to_radians(),
        );
        assert!(document.resize_node(id, "se", 20.0, 15.0));
        let after = &document.active_page().nodes[1];
        let fixed_after = rotate_around(
            (after.x, after.y),
            (after.x + after.width / 2.0, after.y + after.height / 2.0),
            after.rotation.to_radians(),
        );
        assert!((fixed_before.0 - fixed_after.0).abs() < 0.001);
        assert!((fixed_before.1 - fixed_after.1).abs() < 0.001);
        assert_eq!(after.width, before.width + 20.0);
        assert_eq!(after.height, before.height + 15.0);
    }

    #[test]
    fn row_and_column_layout_reflow_group_children_with_gap_and_padding() {
        let mut document = Document::demo();
        let ids = [
            document.active_page().nodes[4].id,
            document.active_page().nodes[5].id,
        ];
        let group_id = document.group_nodes(&ids).unwrap();
        assert!(document.set_node_layout(
            group_id,
            LayoutMode::Row,
            LayoutAlign::Center,
            LayoutAlign::Start,
            12.0,
            [8.0, 6.0, 8.0, 10.0]
        ));
        let group = document
            .active_page()
            .nodes
            .iter()
            .find(|node| node.id == group_id)
            .unwrap();
        let children: Vec<_> = document
            .active_page()
            .nodes
            .iter()
            .filter(|node| node.parent_id == Some(group_id))
            .collect();
        assert_eq!(children[0].x, group.x + 10.0);
        assert_eq!(children[1].x, children[0].x + children[0].width + 12.0);
        assert!(document.set_node_layout(
            group_id,
            LayoutMode::Column,
            LayoutAlign::End,
            LayoutAlign::Start,
            5.0,
            [7.0, 9.0, 3.0, 2.0]
        ));
        let group = document
            .active_page()
            .nodes
            .iter()
            .find(|node| node.id == group_id)
            .unwrap();
        let children: Vec<_> = document
            .active_page()
            .nodes
            .iter()
            .filter(|node| node.parent_id == Some(group_id))
            .collect();
        assert_eq!(children[0].y, group.y + 7.0);
        assert_eq!(children[1].y, children[0].y + children[0].height + 5.0);
        assert_eq!(
            children[0].x,
            group.x + group.width - 9.0 - children[0].width
        );
        assert!(document.set_node_width_sizing(ids[0], LayoutSizing::Fill));
        let group = document
            .active_page()
            .nodes
            .iter()
            .find(|node| node.id == group_id)
            .unwrap();
        let child = document
            .active_page()
            .nodes
            .iter()
            .find(|node| node.id == ids[0])
            .unwrap();
        assert_eq!(child.width, group.width - 2.0 - 9.0);
        let expected_height = document
            .active_page()
            .nodes
            .iter()
            .filter(|node| node.parent_id == Some(group_id))
            .map(|node| node.height)
            .sum::<f32>()
            + 5.0
            + 7.0
            + 3.0;
        assert!(document.set_node_auto_height(group_id, true));
        let group = document
            .active_page()
            .nodes
            .iter()
            .find(|node| node.id == group_id)
            .unwrap();
        assert_eq!(group.height, expected_height);
    }

    #[test]
    fn artboard_guides_store_grid_and_column_configuration() {
        let mut document = Document::demo();
        let artboard_id = document
            .active_page()
            .nodes
            .iter()
            .find(|node| node.kind == NodeKind::Frame)
            .unwrap()
            .id;
        assert!(document.set_artboard_guide(
            artboard_id,
            GuideMode::Columns,
            12,
            24.0,
            [0.2, 0.4, 1.0, 1.0],
            0.2
        ));
        let artboard = document
            .active_page()
            .nodes
            .iter()
            .find(|node| node.id == artboard_id)
            .unwrap();
        assert_eq!(artboard.guide_mode, GuideMode::Columns);
        assert_eq!(artboard.guide_count, 12);
        assert_eq!(artboard.guide_gap, 24.0);
        assert_eq!(artboard.guide_opacity, 0.2);
        let json = serde_json::to_string(&document).unwrap();
        let restored: Document = serde_json::from_str(&json).unwrap();
        assert_eq!(
            restored
                .active_page()
                .nodes
                .iter()
                .find(|node| node.id == artboard_id)
                .unwrap()
                .guide_mode,
            GuideMode::Columns
        );
    }

    #[test]
    fn new_and_dragged_nodes_are_parented_to_their_artboard() {
        let mut document = Document::demo();
        let artboards: Vec<_> = document
            .active_page()
            .nodes
            .iter()
            .filter(|node| node.kind == NodeKind::Frame && node.parent_id.is_none())
            .cloned()
            .collect();
        let first = &artboards[0];
        let second = &artboards[1];
        let id = document.add_rectangle_to(Some(second.id));
        assert_eq!(
            document
                .active_page()
                .nodes
                .iter()
                .find(|node| node.id == id)
                .unwrap()
                .parent_id,
            Some(second.id)
        );
        assert!(document.set_node_bounds(id, first.x + 20.0, first.y + 20.0, 40.0, 40.0));
        assert!(document.reparent_nodes_to_artboards(&[id]));
        assert_eq!(
            document
                .active_page()
                .nodes
                .iter()
                .find(|node| node.id == id)
                .unwrap()
                .parent_id,
            Some(first.id)
        );
        assert!(document.set_node_bounds(id, -500.0, -500.0, 40.0, 40.0));
        assert!(document.reparent_nodes_to_artboards(&[id]));
        assert_eq!(
            document
                .active_page()
                .nodes
                .iter()
                .find(|node| node.id == id)
                .unwrap()
                .parent_id,
            None
        );
    }

    #[test]
    fn reparented_children_render_above_the_destination_artboard() {
        let mut document = Document::demo();
        let artboards: Vec<_> = document
            .active_page()
            .nodes
            .iter()
            .filter(|node| node.kind == NodeKind::Frame && node.parent_id.is_none())
            .cloned()
            .collect();
        let moved_id = document
            .active_page()
            .nodes
            .iter()
            .find(|node| node.parent_id == Some(artboards[0].id))
            .unwrap()
            .id;
        assert!(document.set_node_bounds(
            moved_id,
            artboards[1].x + 10.0,
            artboards[1].y + 10.0,
            40.0,
            40.0
        ));
        assert!(document.reparent_nodes_to_artboards(&[moved_id]));
        let order: Vec<_> = ordered_nodes(document.active_page())
            .into_iter()
            .map(|node| node.id)
            .collect();
        let artboard_index = order.iter().position(|id| *id == artboards[1].id).unwrap();
        let child_index = order.iter().position(|id| *id == moved_id).unwrap();
        assert!(child_index > artboard_index);
    }

    #[test]
    fn document_color_library_deduplicates_normalized_colors() {
        let mut document = Document::demo();
        let first = document.add_document_color("Brand".into(), "#82E6B8".into());
        let second = document.add_document_color("Duplicate".into(), "#82E6B8".into());
        assert_eq!(first, second);
        assert_eq!(document.color_library.len(), 1);
        assert_eq!(document.color_library[0].name, "Brand");
    }

    #[test]
    fn undo_redo_and_transactions_restore_document_states() {
        let mut engine = DocumentEngine::new();
        let id = engine.document.active_page().nodes[1].id;
        let original_x = engine.document.active_page().nodes[1].x;
        engine.begin_transaction();
        engine.move_nodes(&format!("[{id}]"), 5.0, 0.0).unwrap();
        engine.move_nodes(&format!("[{id}]"), 7.0, 0.0).unwrap();
        engine.end_transaction();
        assert_eq!(engine.document.active_page().nodes[1].x, original_x + 12.0);
        assert!(engine.undo());
        assert_eq!(engine.document.active_page().nodes[1].x, original_x);
        assert!(engine.redo());
        assert_eq!(engine.document.active_page().nodes[1].x, original_x + 12.0);
        assert!(!engine.redo());
    }

    #[test]
    fn selected_nodes_align_to_their_combined_bounds() {
        let mut document = Document::demo();
        let ids = [
            document.active_page().nodes[4].id,
            document.active_page().nodes[5].id,
        ];
        assert!(document.align_nodes(&ids, "top"));
        let nodes: Vec<_> = document
            .active_page()
            .nodes
            .iter()
            .filter(|node| ids.contains(&node.id))
            .collect();
        assert_eq!(nodes[0].y, nodes[1].y);
        assert!(document.align_nodes(&ids, "left"));
        assert_eq!(
            document.active_page().nodes[4].x,
            document.active_page().nodes[5].x
        );
    }
}
