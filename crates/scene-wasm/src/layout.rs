use crate::*;

impl Document {
    pub(crate) fn relayout_container(&mut self, node_id: EntityId) {
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
        let children: Vec<(EntityId, f32, f32, LayoutSizing)> = self
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
            container.height = (top + content_height + bottom).round().max(8.0);
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
        let mut moved_containers = Vec::new();
        for (child_id, _, _, sizing) in children {
            let Some(child) = page.nodes.iter_mut().find(|node| node.id == child_id) else {
                continue;
            };
            let previous_x = child.x;
            let previous_y = child.y;
            if container.layout_mode == LayoutMode::Row {
                if sizing == LayoutSizing::Fill {
                    child.width = fill_width.round().max(8.0);
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
                    child.width = fill_width.round().max(8.0);
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
            if child.kind == NodeKind::Group || child.kind == NodeKind::Frame {
                moved_containers.push((child.id, child.x - previous_x, child.y - previous_y));
            }
        }
        for (container_id, dx, dy) in moved_containers {
            if dx == 0.0 && dy == 0.0 {
                continue;
            }
            let mut descendants = std::collections::HashSet::from([container_id]);
            loop {
                let before = descendants.len();
                for node in &page.nodes {
                    if node
                        .parent_id
                        .is_some_and(|parent| descendants.contains(&parent))
                    {
                        descendants.insert(node.id);
                    }
                }
                if descendants.len() == before {
                    break;
                }
            }
            descendants.remove(&container_id);
            for node in &mut page.nodes {
                if descendants.contains(&node.id) {
                    node.x += dx;
                    node.y += dy;
                }
            }
        }
    }
}
