use crate::*;
use std::collections::{HashMap, HashSet};
impl Document {
    pub(crate) fn validate(&self) -> Result<(), String> {
        if self.schema_version != SCHEMA_VERSION {
            return Err(format!(
                "Unsupported schema version {}",
                self.schema_version
            ));
        }
        if self.pages.is_empty() {
            return Err("Document must contain at least one page".into());
        }
        if !self.pages.iter().any(|page| page.id == self.active_page_id) {
            return Err("Active page does not exist".into());
        }
        let mut owned_ids = HashSet::new();
        let variable_ids: HashSet<_> = self.number_variables.iter().map(|item| item.id).collect();
        let text_style_ids: HashSet<_> = self.text_styles.iter().map(|item| item.id).collect();
        let media_asset_ids: HashSet<_> = self.media_assets.iter().map(|item| item.id).collect();
        let component_ids: HashSet<_> = self.components.iter().map(|item| item.id).collect();
        let all_node_ids: HashSet<_> = self
            .pages
            .iter()
            .flat_map(|page| page.nodes.iter().map(|node| node.id))
            .collect();
        for page in &self.pages {
            if !owned_ids.insert(page.id) {
                return Err(format!("Duplicate page or object ID {}", page.id));
            }
            let nodes_by_id: HashMap<_, _> =
                page.nodes.iter().map(|node| (node.id, node)).collect();
            if nodes_by_id.len() != page.nodes.len() {
                return Err(format!("Page {} contains duplicate node IDs", page.id));
            }
            for node in &page.nodes {
                if !owned_ids.insert(node.id) {
                    return Err(format!("Node {} belongs to more than one page", node.id));
                }
                if node.kind == NodeKind::Vector && node.vector.is_none() {
                    return Err(format!("Vector node {} has no geometry", node.id));
                }
                if node.kind != NodeKind::Vector && node.vector.is_some() {
                    return Err(format!("Non-vector node {} has vector geometry", node.id));
                }
                if let Some(vector) = &node.vector {
                    validate_vector(node.id, vector)?;
                }
                if let Some(parent_id) = node.parent_id {
                    let Some(parent) = nodes_by_id.get(&parent_id) else {
                        return Err(format!(
                            "Node {} has a parent outside page {}",
                            node.id, page.id
                        ));
                    };
                    if !matches!(parent.kind, NodeKind::Frame | NodeKind::Group) {
                        return Err(format!(
                            "Node {} has non-container parent {}",
                            node.id, parent_id
                        ));
                    }
                }

                let mut ancestors = HashSet::new();
                let mut ancestor_id = node.parent_id;
                while let Some(id) = ancestor_id {
                    if id == node.id || !ancestors.insert(id) {
                        return Err(format!("Node {} is part of a parent cycle", node.id));
                    }
                    ancestor_id = nodes_by_id.get(&id).and_then(|ancestor| ancestor.parent_id);
                }
                for variable_id in [
                    node.variable_bindings.width,
                    node.variable_bindings.height,
                    node.variable_bindings.gap,
                    node.variable_bindings.padding[0],
                    node.variable_bindings.padding[1],
                    node.variable_bindings.padding[2],
                    node.variable_bindings.padding[3],
                ]
                .into_iter()
                .flatten()
                {
                    if !variable_ids.contains(&variable_id) {
                        return Err(format!(
                            "Node {} references missing variable {}",
                            node.id, variable_id
                        ));
                    }
                }
                if let Some(style_id) = node.text_style_id
                    && !text_style_ids.contains(&style_id)
                {
                    return Err(format!(
                        "Node {} references missing text style {}",
                        node.id, style_id
                    ));
                }
                if let Some(asset_id) = node.asset_id
                    && !media_asset_ids.contains(&asset_id)
                {
                    return Err(format!(
                        "Node {} references missing media asset {}",
                        node.id, asset_id
                    ));
                }
                if let Some(component_id) = node.component_id
                    && !component_ids.contains(&component_id)
                {
                    return Err(format!(
                        "Node {} references missing component {}",
                        node.id, component_id
                    ));
                }
            }
        }
        for color in &self.color_library {
            if !owned_ids.insert(color.id) {
                return Err(format!("Duplicate page or object ID {}", color.id));
            }
        }
        for variable in &self.number_variables {
            if !owned_ids.insert(variable.id) {
                return Err(format!("Duplicate page or object ID {}", variable.id));
            }
        }
        for style in &self.text_styles {
            if !owned_ids.insert(style.id) {
                return Err(format!("Duplicate page or object ID {}", style.id));
            }
        }
        for asset in &self.media_assets {
            if !owned_ids.insert(asset.id) {
                return Err(format!("Duplicate page or object ID {}", asset.id));
            }
        }
        for component in &self.components {
            if !owned_ids.insert(component.id) {
                return Err(format!("Duplicate page or object ID {}", component.id));
            }
            for variant in &component.variants {
                if !owned_ids.insert(variant.id) {
                    return Err(format!("Duplicate page or object ID {}", variant.id));
                }
                if !all_node_ids.contains(&variant.source_root_id) {
                    return Err(format!(
                        "Component variant {} references missing source {}",
                        variant.id, variant.source_root_id
                    ));
                }
            }
        }
        Ok(())
    }
}

fn validate_vector(node_id: EntityId, vector: &VectorData) -> Result<(), String> {
    match &vector.geometry {
        VectorGeometry::Polygon { sides } if !(3..=100).contains(sides) => {
            return Err(format!("Vector node {node_id} has invalid polygon sides"));
        }
        VectorGeometry::Star {
            points,
            inner_ratio,
        } if !(3..=100).contains(points)
            || !inner_ratio.is_finite()
            || !(0.01..=0.99).contains(inner_ratio) =>
        {
            return Err(format!("Vector node {node_id} has invalid star geometry"));
        }
        VectorGeometry::Path { contours } => {
            let mut contour_ids = std::collections::HashSet::new();
            let mut point_ids = std::collections::HashSet::new();
            for contour in contours {
                if !contour_ids.insert(contour.id)
                    || contour.points.len() < 2
                    || contour.points.iter().any(|point| {
                        !point_ids.insert(point.id)
                            || point
                                .position
                                .iter()
                                .chain(point.handle_in.iter().flatten())
                                .chain(point.handle_out.iter().flatten())
                                .any(|value| !value.is_finite())
                    })
                {
                    return Err(format!("Vector node {node_id} has an invalid contour"));
                }
            }
        }
        _ => {}
    }
    Ok(())
}
