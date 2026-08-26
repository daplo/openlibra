use crate::*;

#[wasm_bindgen]
impl DocumentEngine {
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
}
