use crate::*;

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

    pub fn new_blank() -> Self {
        console_error_panic_hook::set_once();
        Self {
            document: Document::blank(),
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

    pub fn set_active_page(&mut self, page_id: String) -> bool {
        self.document.set_active_page(parse_entity_id(&page_id))
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
