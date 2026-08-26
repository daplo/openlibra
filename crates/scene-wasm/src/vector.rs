use crate::geometry::point_in_rotated_node;
use crate::*;
use std::collections::HashSet;
impl Document {
    pub(crate) fn reorder_node(
        &mut self,
        dragged_id: EntityId,
        target_id: EntityId,
        before: bool,
    ) -> bool {
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

    pub(crate) fn reparent_nodes_to_artboards(&mut self, node_ids: &[EntityId]) -> bool {
        let selected: HashSet<EntityId> = node_ids.iter().copied().collect();
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
        let changes: Vec<(EntityId, Option<EntityId>, Option<EntityId>)> = self
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
                let mut ancestor = node.parent_id;
                let mut current_artboard = None;
                while let Some(ancestor_id) = ancestor {
                    let Some(parent) = self.active_node(ancestor_id) else {
                        break;
                    };
                    if parent.kind == NodeKind::Frame && parent.parent_id.is_none() {
                        current_artboard = Some(parent.id);
                        break;
                    }
                    ancestor = parent.parent_id;
                }
                (target != current_artboard).then_some((node.id, node.parent_id, target))
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
        let affected: HashSet<EntityId> = changes
            .iter()
            .flat_map(|(_, old, new)| [*old, *new])
            .flatten()
            .collect();
        for parent_id in affected {
            self.relayout_container(parent_id);
        }
        true
    }

    pub(crate) fn update_vector_parameters(
        &mut self,
        node_id: EntityId,
        count: u16,
        inner_ratio: f32,
    ) -> bool {
        let Some(node) = self.active_node_mut(node_id) else {
            return false;
        };
        if node.locked || node.kind != NodeKind::Vector {
            return false;
        }
        let Some(vector) = &mut node.vector else {
            return false;
        };
        match &mut vector.geometry {
            VectorGeometry::Polygon { sides } => *sides = count.clamp(3, 100),
            VectorGeometry::Star {
                points,
                inner_ratio: ratio,
            } => {
                *points = count.clamp(3, 100);
                *ratio = inner_ratio.clamp(0.01, 0.99);
            }
            _ => return false,
        }
        true
    }

    pub(crate) fn set_vector_fill_rule(&mut self, node_id: EntityId, rule: FillRule) -> bool {
        let Some(node) = self.active_node_mut(node_id) else {
            return false;
        };
        if node.locked || node.kind != NodeKind::Vector {
            return false;
        }
        let Some(vector) = &mut node.vector else {
            return false;
        };
        if vector.fill_rule == rule {
            return false;
        }
        vector.fill_rule = rule;
        true
    }

    pub(crate) fn convert_vector_to_path(&mut self, node_id: EntityId) -> bool {
        let Some(node) = self.active_node_mut(node_id) else {
            return false;
        };
        if node.locked || node.kind != NodeKind::Vector {
            return false;
        }
        let Some(vector) = &mut node.vector else {
            return false;
        };
        let Some(contours) = contours_for_geometry(&vector.geometry) else {
            return false;
        };
        vector.geometry = VectorGeometry::Path { contours };
        true
    }

    pub(crate) fn move_vector_point(
        &mut self,
        node_id: EntityId,
        contour_index: usize,
        point_index: usize,
        x: f32,
        y: f32,
    ) -> bool {
        if !x.is_finite() || !y.is_finite() {
            return false;
        }
        let Some(node) = self.active_node_mut(node_id) else {
            return false;
        };
        if node.locked || node.kind != NodeKind::Vector {
            return false;
        }
        let Some(VectorGeometry::Path { contours }) =
            node.vector.as_mut().map(|vector| &mut vector.geometry)
        else {
            return false;
        };
        let Some(point) = contours
            .get_mut(contour_index)
            .and_then(|contour| contour.points.get_mut(point_index))
        else {
            return false;
        };
        let next = [x.clamp(-10.0, 10.0), y.clamp(-10.0, 10.0)];
        if point.position == next {
            return false;
        }
        let delta = [next[0] - point.position[0], next[1] - point.position[1]];
        point.position = next;
        for handle in [&mut point.handle_in, &mut point.handle_out]
            .into_iter()
            .flatten()
        {
            handle[0] += delta[0];
            handle[1] += delta[1];
        }
        true
    }

    pub(crate) fn delete_vector_point(
        &mut self,
        node_id: EntityId,
        contour_index: usize,
        point_index: usize,
    ) -> bool {
        let Some(node) = self.active_node_mut(node_id) else {
            return false;
        };
        if node.locked || node.kind != NodeKind::Vector {
            return false;
        }
        let Some(VectorGeometry::Path { contours }) =
            node.vector.as_mut().map(|vector| &mut vector.geometry)
        else {
            return false;
        };
        let Some(contour) = contours.get_mut(contour_index) else {
            return false;
        };
        let minimum = if contour.closed { 3 } else { 2 };
        if contour.points.len() <= minimum || point_index >= contour.points.len() {
            return false;
        }
        contour.points.remove(point_index);
        true
    }

    pub(crate) fn cut_vector_path(
        &mut self,
        node_id: EntityId,
        contour_index: usize,
        point_index: usize,
    ) -> bool {
        let Some(node) = self.active_node_mut(node_id) else {
            return false;
        };
        if node.locked || node.kind != NodeKind::Vector {
            return false;
        }
        let Some(VectorGeometry::Path { contours }) =
            node.vector.as_mut().map(|vector| &mut vector.geometry)
        else {
            return false;
        };
        let Some(contour) = contours.get_mut(contour_index) else {
            return false;
        };
        if point_index >= contour.points.len() {
            return false;
        }
        if contour.closed {
            contour.points.rotate_left(point_index);
            contour.closed = false;
            return true;
        }
        if point_index == 0 || point_index + 1 >= contour.points.len() {
            return false;
        }
        let split_point = contour.points[point_index].clone();
        let right = contour.points.split_off(point_index);
        contour.points.push(split_point);
        contours.insert(
            contour_index + 1,
            VectorContour {
                points: right,
                closed: false,
            },
        );
        true
    }

    pub(crate) fn join_vector_path(&mut self, node_id: EntityId) -> bool {
        let Some(node) = self.active_node_mut(node_id) else {
            return false;
        };
        if node.locked || node.kind != NodeKind::Vector {
            return false;
        }
        let Some(VectorGeometry::Path { contours }) =
            node.vector.as_mut().map(|vector| &mut vector.geometry)
        else {
            return false;
        };
        let open: Vec<_> = contours
            .iter()
            .enumerate()
            .filter_map(|(index, contour)| (!contour.closed).then_some(index))
            .collect();
        if open.len() == 1 {
            contours[open[0]].closed = true;
            return true;
        }
        let [first, second, ..] = open.as_slice() else {
            return false;
        };
        let mut b = contours.remove(*second);
        let mut a = contours.remove(*first);
        let candidates = [
            (false, false, endpoint_distance(&a, false, &b, true)),
            (false, true, endpoint_distance(&a, false, &b, false)),
            (true, false, endpoint_distance(&a, true, &b, true)),
            (true, true, endpoint_distance(&a, true, &b, false)),
        ];
        let (reverse_a, reverse_b, _) = candidates
            .into_iter()
            .min_by(|left, right| left.2.total_cmp(&right.2))
            .expect("join candidates are non-empty");
        if reverse_a {
            reverse_contour(&mut a);
        }
        if reverse_b {
            reverse_contour(&mut b);
        }
        a.points.extend(b.points);
        contours.insert(
            *first,
            VectorContour {
                points: a.points,
                closed: false,
            },
        );
        true
    }
}

fn reverse_contour(contour: &mut VectorContour) {
    contour.points.reverse();
    for point in &mut contour.points {
        std::mem::swap(&mut point.handle_in, &mut point.handle_out);
    }
}

fn endpoint_distance(
    first: &VectorContour,
    first_start: bool,
    second: &VectorContour,
    second_start: bool,
) -> f32 {
    let a = if first_start {
        &first.points[0]
    } else {
        first.points.last().expect("validated contour")
    };
    let b = if second_start {
        &second.points[0]
    } else {
        second.points.last().expect("validated contour")
    };
    (a.position[0] - b.position[0]).powi(2) + (a.position[1] - b.position[1]).powi(2)
}

fn contours_for_geometry(geometry: &VectorGeometry) -> Option<Vec<VectorContour>> {
    let points = match geometry {
        VectorGeometry::Ellipse => {
            let kappa = 0.552_284_8;
            return Some(vec![VectorContour {
                closed: true,
                points: vec![
                    vector_point(
                        [0.5, 0.0],
                        Some([0.5 - kappa / 2.0, 0.0]),
                        Some([0.5 + kappa / 2.0, 0.0]),
                    ),
                    vector_point(
                        [1.0, 0.5],
                        Some([1.0, 0.5 - kappa / 2.0]),
                        Some([1.0, 0.5 + kappa / 2.0]),
                    ),
                    vector_point(
                        [0.5, 1.0],
                        Some([0.5 + kappa / 2.0, 1.0]),
                        Some([0.5 - kappa / 2.0, 1.0]),
                    ),
                    vector_point(
                        [0.0, 0.5],
                        Some([0.0, 0.5 + kappa / 2.0]),
                        Some([0.0, 0.5 - kappa / 2.0]),
                    ),
                ],
            }]);
        }
        VectorGeometry::Line => {
            return Some(vec![VectorContour {
                closed: false,
                points: vec![
                    vector_point([0.0, 0.5], None, None),
                    vector_point([1.0, 0.5], None, None),
                ],
            }]);
        }
        VectorGeometry::Polygon { sides } => regular_shape_points(*sides as usize, 1.0),
        VectorGeometry::Star {
            points,
            inner_ratio,
        } => regular_shape_points(*points as usize * 2, *inner_ratio),
        VectorGeometry::Path { .. } => return None,
    };
    Some(vec![VectorContour {
        points,
        closed: true,
    }])
}

fn regular_shape_points(count: usize, inner_ratio: f32) -> Vec<VectorPoint> {
    (0..count)
        .map(|index| {
            let radius = if index % 2 == 1 { inner_ratio } else { 1.0 } * 0.5;
            let angle =
                -std::f32::consts::FRAC_PI_2 + index as f32 * std::f32::consts::TAU / count as f32;
            vector_point(
                [0.5 + angle.cos() * radius, 0.5 + angle.sin() * radius],
                None,
                None,
            )
        })
        .collect()
}

fn vector_point(
    position: [f32; 2],
    handle_in: Option<[f32; 2]>,
    handle_out: Option<[f32; 2]>,
) -> VectorPoint {
    VectorPoint {
        position,
        handle_in,
        handle_out,
        point_type: if handle_in.is_some() || handle_out.is_some() {
            VectorPointType::Smooth
        } else {
            VectorPointType::Corner
        },
    }
}
