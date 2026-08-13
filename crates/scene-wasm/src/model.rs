use serde::{Deserialize, Serialize};
use uuid::Uuid;

pub(crate) type EntityId = Uuid;

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct Document {
    pub(crate) schema_version: u32,
    pub(crate) active_page_id: EntityId,
    pub(crate) pages: Vec<Page>,
    #[serde(default)]
    pub(crate) color_library: Vec<ColorAsset>,
    #[serde(default)]
    pub(crate) number_variables: Vec<NumberVariable>,
    #[serde(default)]
    pub(crate) text_styles: Vec<TextStyleAsset>,
    #[serde(default)]
    pub(crate) media_assets: Vec<MediaAsset>,
    #[serde(default)]
    pub(crate) components: Vec<ComponentDefinition>,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct ComponentDefinition {
    pub(crate) id: EntityId,
    pub(crate) name: String,
    pub(crate) variants: Vec<ComponentVariant>,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct ComponentVariant {
    pub(crate) id: EntityId,
    pub(crate) name: String,
    pub(crate) source_root_id: EntityId,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct ColorAsset {
    pub(crate) id: EntityId,
    pub(crate) name: String,
    pub(crate) value: String,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct NumberVariable {
    pub(crate) id: EntityId,
    pub(crate) name: String,
    pub(crate) value: f32,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct TextStyleAsset {
    pub(crate) id: EntityId,
    pub(crate) name: String,
    pub(crate) style: TypographyStyle,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct MediaAsset {
    pub(crate) id: EntityId,
    pub(crate) name: String,
    pub(crate) kind: MediaAssetKind,
    pub(crate) mime_type: String,
    pub(crate) source: String,
    pub(crate) width: u32,
    pub(crate) height: u32,
    #[serde(default)]
    pub(crate) tags: Vec<String>,
}

#[derive(Clone, Copy, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum MediaAssetKind {
    Image,
    Icon,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct Page {
    pub(crate) id: EntityId,
    pub(crate) name: String,
    #[serde(default)]
    pub(crate) description: String,
    pub(crate) nodes: Vec<Node>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub(crate) benchmark_node_count: Option<usize>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub(crate) benchmark_modified_node_ids: Vec<EntityId>,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct Node {
    pub(crate) id: EntityId,
    pub(crate) name: String,
    pub(crate) kind: NodeKind,
    pub(crate) parent_id: Option<EntityId>,
    pub(crate) x: f32,
    pub(crate) y: f32,
    pub(crate) width: f32,
    pub(crate) height: f32,
    pub(crate) fill: [f32; 4],
    pub(crate) stroke: [f32; 4],
    pub(crate) stroke_width: f32,
    #[serde(default)]
    pub(crate) corner_radii: [f32; 4],
    #[serde(default)]
    pub(crate) stroke_align: StrokeAlign,
    #[serde(default)]
    pub(crate) stroke_join: StrokeJoin,
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
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub(crate) text: Option<TextStyle>,
    #[serde(default)]
    pub(crate) variable_bindings: VariableBindings,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub(crate) text_style_id: Option<EntityId>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub(crate) asset_id: Option<EntityId>,
    #[serde(default)]
    pub(crate) image_fit: ImageFit,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub(crate) component_id: Option<EntityId>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub(crate) component_variant_id: Option<EntityId>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub(crate) component_slot_id: Option<EntityId>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub(crate) instance_root_id: Option<EntityId>,
    #[serde(default)]
    pub(crate) text_override: bool,
    #[serde(default)]
    pub(crate) asset_override: bool,
}

#[derive(Clone, Debug, Default, Serialize, Deserialize, PartialEq)]
pub struct VariableBindings {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub(crate) width: Option<EntityId>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub(crate) height: Option<EntityId>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub(crate) gap: Option<EntityId>,
    #[serde(default)]
    pub(crate) padding: [Option<EntityId>; 4],
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct TextStyle {
    #[serde(default = "default_text_content")]
    pub(crate) content: String,
    #[serde(default = "default_font_family")]
    pub(crate) font_family: String,
    #[serde(default = "default_font_weight")]
    pub(crate) font_weight: u16,
    #[serde(default = "default_font_size")]
    pub(crate) font_size: f32,
    #[serde(default = "default_line_height")]
    pub(crate) line_height: f32,
    #[serde(default)]
    pub(crate) letter_spacing: f32,
    #[serde(default)]
    pub(crate) horizontal_align: TextAlign,
    #[serde(default)]
    pub(crate) vertical_align: TextVerticalAlign,
    #[serde(default)]
    pub(crate) font_style: FontStyle,
    #[serde(default)]
    pub(crate) sizing: TextSizing,
}

impl Default for TextStyle {
    fn default() -> Self {
        Self {
            content: default_text_content(),
            font_family: default_font_family(),
            font_weight: default_font_weight(),
            font_size: default_font_size(),
            line_height: default_line_height(),
            letter_spacing: 0.0,
            horizontal_align: TextAlign::Left,
            vertical_align: TextVerticalAlign::Top,
            font_style: FontStyle::Normal,
            sizing: TextSizing::AutoWidth,
        }
    }
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct TypographyStyle {
    pub(crate) font_family: String,
    pub(crate) font_weight: u16,
    pub(crate) font_size: f32,
    pub(crate) line_height: f32,
    pub(crate) letter_spacing: f32,
    pub(crate) horizontal_align: TextAlign,
    pub(crate) vertical_align: TextVerticalAlign,
    pub(crate) font_style: FontStyle,
    #[serde(default)]
    pub(crate) sizing: TextSizing,
}

impl From<&TextStyle> for TypographyStyle {
    fn from(text: &TextStyle) -> Self {
        Self {
            font_family: text.font_family.clone(),
            font_weight: text.font_weight,
            font_size: text.font_size,
            line_height: text.line_height,
            letter_spacing: text.letter_spacing,
            horizontal_align: text.horizontal_align,
            vertical_align: text.vertical_align,
            font_style: text.font_style,
            sizing: text.sizing,
        }
    }
}

impl TypographyStyle {
    pub(crate) fn apply_to(&self, text: &mut TextStyle) {
        text.font_family = self.font_family.clone();
        text.font_weight = self.font_weight;
        text.font_size = self.font_size;
        text.line_height = self.line_height;
        text.letter_spacing = self.letter_spacing;
        text.horizontal_align = self.horizontal_align;
        text.vertical_align = self.vertical_align;
        text.font_style = self.font_style;
        text.sizing = self.sizing;
    }
}

fn default_text_content() -> String {
    "Text".into()
}
fn default_font_family() -> String {
    "Arial".into()
}
fn default_font_weight() -> u16 {
    400
}
fn default_font_size() -> f32 {
    24.0
}
fn default_line_height() -> f32 {
    1.2
}

#[derive(Clone, Copy, Debug, Default, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum TextAlign {
    #[default]
    Left,
    Center,
    Right,
    Justify,
}

#[derive(Clone, Copy, Debug, Default, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum TextVerticalAlign {
    #[default]
    Top,
    Middle,
    Bottom,
}

#[derive(Clone, Copy, Debug, Default, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum FontStyle {
    #[default]
    Normal,
    Italic,
}

#[derive(Clone, Copy, Debug, Default, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum TextSizing {
    #[default]
    AutoWidth,
    AutoHeight,
    Fixed,
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
pub enum StrokeAlign {
    #[default]
    Inside,
    Center,
    Outside,
}

#[derive(Clone, Copy, Debug, Default, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum StrokeJoin {
    #[default]
    Round,
    Straight,
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
    #[serde(default = "Uuid::now_v7")]
    pub(crate) id: EntityId,
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
    Image,
    Icon,
}

#[derive(Clone, Copy, Debug, Default, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum ImageFit {
    #[default]
    Cover,
    Contain,
    Fill,
}

#[derive(Serialize)]
pub(crate) struct DocumentReadModel<'a> {
    pub(crate) schema_version: u32,
    pub(crate) active_page_id: EntityId,
    pub(crate) pages: Vec<PageSummary<'a>>,
    pub(crate) nodes: &'a [Node],
    pub(crate) document_colors: &'a [ColorAsset],
    pub(crate) number_variables: &'a [NumberVariable],
    pub(crate) text_styles: &'a [TextStyleAsset],
    pub(crate) media_assets: &'a [MediaAsset],
    pub(crate) components: &'a [ComponentDefinition],
}

#[derive(Serialize)]
pub(crate) struct PageSummary<'a> {
    pub(crate) id: EntityId,
    pub(crate) name: &'a str,
    pub(crate) description: &'a str,
}
