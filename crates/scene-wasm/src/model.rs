use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct Document {
    pub(crate) schema_version: u32,
    pub(crate) next_id: u64,
    pub(crate) active_page_id: u64,
    pub(crate) pages: Vec<Page>,
    #[serde(default)]
    pub(crate) color_library: Vec<ColorAsset>,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct ColorAsset {
    pub(crate) id: u64,
    pub(crate) name: String,
    pub(crate) value: String,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct Page {
    pub(crate) id: u64,
    pub(crate) name: String,
    #[serde(default)]
    pub(crate) description: String,
    pub(crate) nodes: Vec<Node>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub(crate) benchmark_node_count: Option<usize>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub(crate) benchmark_modified_node_ids: Vec<u64>,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct Node {
    pub(crate) id: u64,
    pub(crate) name: String,
    pub(crate) kind: NodeKind,
    pub(crate) parent_id: Option<u64>,
    pub(crate) x: f32,
    pub(crate) y: f32,
    pub(crate) width: f32,
    pub(crate) height: f32,
    pub(crate) fill: [f32; 4],
    pub(crate) stroke: [f32; 4],
    pub(crate) stroke_width: f32,
    pub(crate) corner_radius: f32,
    pub(crate) opacity: f32,
    #[serde(default)]
    pub(crate) rotation: f32,
    #[serde(default)]
    pub(crate) flip_x: bool,
    #[serde(default)]
    pub(crate) flip_y: bool,
    #[serde(default)]
    pub(crate) shadows: Vec<Shadow>,
    #[serde(default)]
    pub(crate) layout_mode: LayoutMode,
    #[serde(default)]
    pub(crate) layout_align: LayoutAlign,
    #[serde(default)]
    pub(crate) layout_justify: LayoutAlign,
    #[serde(default)]
    pub(crate) layout_gap: f32,
    #[serde(default)]
    pub(crate) layout_padding: [f32; 4],
    #[serde(default)]
    pub(crate) width_sizing: LayoutSizing,
    #[serde(default)]
    pub(crate) auto_height: bool,
    #[serde(default)]
    pub(crate) guide_mode: GuideMode,
    #[serde(default = "default_guide_count")]
    pub(crate) guide_count: u32,
    #[serde(default = "default_guide_gap")]
    pub(crate) guide_gap: f32,
    #[serde(default)]
    pub(crate) guide_color: [f32; 4],
    #[serde(default = "default_guide_opacity")]
    pub(crate) guide_opacity: f32,
    pub(crate) locked: bool,
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

pub(crate) fn default_guide_count() -> u32 {
    12
}
pub(crate) fn default_guide_gap() -> f32 {
    16.0
}
pub(crate) fn default_guide_opacity() -> f32 {
    0.12
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct Shadow {
    pub(crate) kind: ShadowKind,
    pub(crate) color: [f32; 4],
    pub(crate) offset_x: f32,
    pub(crate) offset_y: f32,
    pub(crate) blur: f32,
    pub(crate) spread: f32,
    pub(crate) enabled: bool,
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
pub(crate) struct DocumentReadModel<'a> {
    pub(crate) schema_version: u32,
    pub(crate) active_page_id: u64,
    pub(crate) pages: Vec<PageSummary<'a>>,
    pub(crate) nodes: &'a [Node],
    pub(crate) document_colors: &'a [ColorAsset],
}

#[derive(Serialize)]
pub(crate) struct PageSummary<'a> {
    pub(crate) id: u64,
    pub(crate) name: &'a str,
    pub(crate) description: &'a str,
}
