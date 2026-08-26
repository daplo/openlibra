use crate::*;
impl Document {
    pub(crate) fn add_number_variable(&mut self, name: String, value: f32) -> Option<EntityId> {
        if !value.is_finite() {
            return None;
        }
        let id = self.allocate_id();
        self.number_variables.push(NumberVariable {
            id,
            name: clean_asset_name(name, "Variable"),
            value: value.clamp(0.0, 10000.0),
        });
        Some(id)
    }

    pub(crate) fn update_number_variable(
        &mut self,
        variable_id: EntityId,
        name: String,
        value: f32,
    ) -> bool {
        if !value.is_finite() {
            return false;
        }
        let Some(variable) = self
            .number_variables
            .iter_mut()
            .find(|variable| variable.id == variable_id)
        else {
            return false;
        };
        variable.name = clean_asset_name(name, "Variable");
        variable.value = value.clamp(0.0, 10000.0);
        let value = variable.value;
        for page in &mut self.pages {
            for node in &mut page.nodes {
                if node.variable_bindings.width == Some(variable_id) {
                    node.width = value.round().max(8.0);
                }
                if node.variable_bindings.height == Some(variable_id) {
                    node.height = value.round().max(8.0);
                }
                if node.variable_bindings.gap == Some(variable_id) {
                    node.layout_gap = value.min(1000.0);
                }
                for index in 0..4 {
                    if node.variable_bindings.padding[index] == Some(variable_id) {
                        node.layout_padding[index] = value.min(1000.0);
                    }
                }
            }
        }
        self.relayout_active_token_nodes();
        true
    }

    pub(crate) fn delete_number_variable(&mut self, variable_id: EntityId) -> bool {
        let before = self.number_variables.len();
        self.number_variables
            .retain(|variable| variable.id != variable_id);
        if self.number_variables.len() == before {
            return false;
        }
        for page in &mut self.pages {
            for node in &mut page.nodes {
                if node.variable_bindings.width == Some(variable_id) {
                    node.variable_bindings.width = None;
                }
                if node.variable_bindings.height == Some(variable_id) {
                    node.variable_bindings.height = None;
                }
                if node.variable_bindings.gap == Some(variable_id) {
                    node.variable_bindings.gap = None;
                }
                for binding in &mut node.variable_bindings.padding {
                    if *binding == Some(variable_id) {
                        *binding = None;
                    }
                }
            }
        }
        true
    }

    pub(crate) fn bind_node_variable(
        &mut self,
        node_id: EntityId,
        property: &str,
        variable_id: Option<EntityId>,
    ) -> bool {
        let value = variable_id.and_then(|id| {
            self.number_variables
                .iter()
                .find(|variable| variable.id == id)
                .map(|variable| variable.value)
        });
        if variable_id.is_some() && value.is_none() {
            return false;
        }
        let parent_id = {
            let Some(node) = self.active_node_mut(node_id) else {
                return false;
            };
            if node.locked {
                return false;
            }
            match property {
                "width" => {
                    node.variable_bindings.width = variable_id;
                    if let Some(value) = value {
                        node.width = value.round().max(8.0);
                    }
                }
                "height" => {
                    node.variable_bindings.height = variable_id;
                    if let Some(value) = value {
                        node.height = value.round().max(8.0);
                    }
                }
                "gap" if matches!(node.kind, NodeKind::Frame | NodeKind::Group) => {
                    node.variable_bindings.gap = variable_id;
                    if let Some(value) = value {
                        node.layout_gap = value.min(1000.0);
                    }
                }
                "padding_top" | "padding_right" | "padding_bottom" | "padding_left"
                    if matches!(node.kind, NodeKind::Frame | NodeKind::Group) =>
                {
                    let index = match property {
                        "padding_top" => 0,
                        "padding_right" => 1,
                        "padding_bottom" => 2,
                        _ => 3,
                    };
                    node.variable_bindings.padding[index] = variable_id;
                    if let Some(value) = value {
                        node.layout_padding[index] = value.min(1000.0);
                    }
                }
                _ => return false,
            }
            node.parent_id
        };
        self.relayout_container(node_id);
        if let Some(parent_id) = parent_id {
            self.relayout_container(parent_id);
        }
        true
    }

    pub(crate) fn add_text_style(&mut self, name: String, style: TypographyStyle) -> EntityId {
        let id = self.allocate_id();
        self.text_styles.push(TextStyleAsset {
            id,
            name: clean_asset_name(name, "Text style"),
            style: normalize_typography(style),
        });
        id
    }

    pub(crate) fn update_text_style(
        &mut self,
        style_id: EntityId,
        name: String,
        style: TypographyStyle,
    ) -> bool {
        let style = normalize_typography(style);
        let Some(asset) = self
            .text_styles
            .iter_mut()
            .find(|asset| asset.id == style_id)
        else {
            return false;
        };
        asset.name = clean_asset_name(name, "Text style");
        asset.style = style.clone();
        for page in &mut self.pages {
            for node in &mut page.nodes {
                if node.text_style_id == Some(style_id)
                    && let Some(text) = &mut node.text
                {
                    style.apply_to(text);
                }
            }
        }
        true
    }

    pub(crate) fn delete_text_style(&mut self, style_id: EntityId) -> bool {
        let before = self.text_styles.len();
        self.text_styles.retain(|asset| asset.id != style_id);
        if self.text_styles.len() == before {
            return false;
        }
        for page in &mut self.pages {
            for node in &mut page.nodes {
                if node.text_style_id == Some(style_id) {
                    node.text_style_id = None;
                }
            }
        }
        true
    }

    pub(crate) fn bind_node_text_style(
        &mut self,
        node_id: EntityId,
        style_id: Option<EntityId>,
    ) -> bool {
        let style = style_id.and_then(|id| {
            self.text_styles
                .iter()
                .find(|asset| asset.id == id)
                .map(|asset| asset.style.clone())
        });
        if style_id.is_some() && style.is_none() {
            return false;
        }
        let Some(node) = self.active_node_mut(node_id) else {
            return false;
        };
        if node.locked || node.kind != NodeKind::Text {
            return false;
        }
        node.text_style_id = style_id;
        if let (Some(style), Some(text)) = (style, &mut node.text) {
            style.apply_to(text);
        }
        true
    }

    fn relayout_active_token_nodes(&mut self) {
        let containers: Vec<_> = self
            .active_page()
            .nodes
            .iter()
            .filter(|node| node.layout_mode != LayoutMode::None)
            .map(|node| node.id)
            .collect();
        for id in containers.iter().rev().chain(containers.iter()) {
            self.relayout_container(*id);
        }
    }
}

pub(crate) fn clean_asset_name(name: String, fallback: &str) -> String {
    let name: String = name.trim().chars().take(80).collect();
    if name.is_empty() {
        fallback.into()
    } else {
        name
    }
}

fn normalize_typography(mut style: TypographyStyle) -> TypographyStyle {
    style.font_family = style.font_family.trim().chars().take(120).collect();
    if style.font_family.is_empty() {
        style.font_family = "Arial".into();
    }
    style.font_weight = style.font_weight.clamp(100, 900);
    style.font_size = style.font_size.clamp(1.0, 512.0);
    style.line_height = style.line_height.clamp(0.5, 5.0);
    style.letter_spacing = style.letter_spacing.clamp(-20.0, 100.0);
    style
}
