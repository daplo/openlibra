use crate::*;

#[wasm_bindgen]
impl DocumentEngine {
    pub fn update_vector_parameters(
        &mut self,
        node_id: String,
        count: u16,
        inner_ratio: f32,
    ) -> bool {
        let node_id = parse_entity_id(&node_id);
        self.mutate(|document| document.update_vector_parameters(node_id, count, inner_ratio))
    }

    pub fn set_vector_fill_rule(&mut self, node_id: String, rule: String) -> bool {
        let node_id = parse_entity_id(&node_id);
        let rule = if rule == "evenodd" {
            FillRule::Evenodd
        } else {
            FillRule::Nonzero
        };
        self.mutate(|document| document.set_vector_fill_rule(node_id, rule))
    }

    pub fn convert_vector_to_path(&mut self, node_id: String) -> bool {
        let node_id = parse_entity_id(&node_id);
        self.mutate(|document| document.convert_vector_to_path(node_id))
    }

    pub fn move_vector_point(
        &mut self,
        node_id: String,
        contour_index: usize,
        point_index: usize,
        x: f32,
        y: f32,
    ) -> bool {
        let node_id = parse_entity_id(&node_id);
        self.mutate(|document| {
            document.move_vector_point(node_id, contour_index, point_index, x, y)
        })
    }

    pub fn delete_vector_point(
        &mut self,
        node_id: String,
        contour_index: usize,
        point_index: usize,
    ) -> bool {
        let node_id = parse_entity_id(&node_id);
        self.mutate(|document| document.delete_vector_point(node_id, contour_index, point_index))
    }

    pub fn cut_vector_path(
        &mut self,
        node_id: String,
        contour_index: usize,
        point_index: usize,
    ) -> bool {
        let node_id = parse_entity_id(&node_id);
        self.mutate(|document| document.cut_vector_path(node_id, contour_index, point_index))
    }

    pub fn join_vector_path(&mut self, node_id: String) -> bool {
        let node_id = parse_entity_id(&node_id);
        self.mutate(|document| document.join_vector_path(node_id))
    }

    pub fn move_vector_point_by_id(
        &mut self,
        node_id: String,
        contour_id: String,
        point_id: String,
        x: f32,
        y: f32,
    ) -> bool {
        let ids = (
            parse_entity_id(&node_id),
            parse_entity_id(&contour_id),
            parse_entity_id(&point_id),
        );
        self.mutate(|document| document.move_vector_point_by_id(ids.0, ids.1, ids.2, x, y))
    }

    pub fn move_vector_handle_by_id(
        &mut self,
        node_id: String,
        contour_id: String,
        point_id: String,
        handle: String,
        x: f32,
        y: f32,
    ) -> bool {
        let ids = (
            parse_entity_id(&node_id),
            parse_entity_id(&contour_id),
            parse_entity_id(&point_id),
        );
        self.mutate(|document| {
            document.move_vector_handle_by_id(ids.0, ids.1, ids.2, handle == "out", x, y)
        })
    }

    pub fn set_vector_point_type_by_id(
        &mut self,
        node_id: String,
        contour_id: String,
        point_id: String,
        point_type: String,
    ) -> bool {
        let point_type = match point_type.as_str() {
            "smooth" => VectorPointType::Smooth,
            "symmetric" => VectorPointType::Symmetric,
            _ => VectorPointType::Corner,
        };
        let ids = (
            parse_entity_id(&node_id),
            parse_entity_id(&contour_id),
            parse_entity_id(&point_id),
        );
        self.mutate(|document| {
            document.set_vector_point_type_by_id(ids.0, ids.1, ids.2, point_type)
        })
    }

    pub fn delete_vector_point_by_id(
        &mut self,
        node_id: String,
        contour_id: String,
        point_id: String,
    ) -> bool {
        let ids = (
            parse_entity_id(&node_id),
            parse_entity_id(&contour_id),
            parse_entity_id(&point_id),
        );
        self.mutate(|document| document.delete_vector_point_by_id(ids.0, ids.1, ids.2))
    }

    pub fn cut_vector_path_by_id(
        &mut self,
        node_id: String,
        contour_id: String,
        point_id: String,
    ) -> bool {
        let ids = (
            parse_entity_id(&node_id),
            parse_entity_id(&contour_id),
            parse_entity_id(&point_id),
        );
        self.mutate(|document| document.cut_vector_path_by_id(ids.0, ids.1, ids.2))
    }

    pub fn insert_vector_point_by_id(
        &mut self,
        node_id: String,
        contour_id: String,
        start_point_id: String,
        t: f32,
    ) -> String {
        let ids = (
            parse_entity_id(&node_id),
            parse_entity_id(&contour_id),
            parse_entity_id(&start_point_id),
        );
        self.mutate(|document| document.insert_vector_point_by_id(ids.0, ids.1, ids.2, t))
            .map_or_else(String::new, |id| id.to_string())
    }

    pub fn cut_vector_segment_by_id(
        &mut self,
        node_id: String,
        contour_id: String,
        start_point_id: String,
        t: f32,
    ) -> String {
        let ids = (
            parse_entity_id(&node_id),
            parse_entity_id(&contour_id),
            parse_entity_id(&start_point_id),
        );
        self.mutate(|document| document.cut_vector_segment_by_id(ids.0, ids.1, ids.2, t))
            .map_or_else(String::new, |id| id.to_string())
    }

    pub fn reframe_vector_path(&mut self, node_id: String) -> bool {
        let node_id = parse_entity_id(&node_id);
        self.mutate(|document| document.reframe_vector_path(node_id))
    }

    pub fn knife_vector_path(
        &mut self,
        node_id: String,
        start_x: f32,
        start_y: f32,
        end_x: f32,
        end_y: f32,
    ) -> bool {
        let node_id = parse_entity_id(&node_id);
        self.mutate(|document| {
            document.knife_vector_path(node_id, [start_x, start_y], [end_x, end_y])
        })
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
}
