use crate::geometry::point_in_rotated_node;
use crate::*;
use std::collections::HashSet;
impl Document {
    pub(crate) fn add_vector_path(
        &mut self,
        points: Vec<VectorPathInputPoint>,
        closed: bool,
        parent_id: Option<EntityId>,
    ) -> Option<EntityId> {
        let minimum = if closed { 3 } else { 2 };
        if points.len() < minimum
            || points.iter().any(|point| {
                point
                    .position
                    .iter()
                    .chain(point.handle_in.iter().flatten())
                    .chain(point.handle_out.iter().flatten())
                    .any(|value| !value.is_finite())
            })
        {
            return None;
        }
        let mut min = [f32::INFINITY; 2];
        let mut max = [f32::NEG_INFINITY; 2];
        for value in points.iter().flat_map(|point| {
            std::iter::once(&point.position)
                .chain(point.handle_in.iter())
                .chain(point.handle_out.iter())
        }) {
            min[0] = min[0].min(value[0]);
            min[1] = min[1].min(value[1]);
            max[0] = max[0].max(value[0]);
            max[1] = max[1].max(value[1]);
        }
        let width = (max[0] - min[0]).max(1.0);
        let height = (max[1] - min[1]).max(1.0);
        let normalize =
            |value: [f32; 2]| [(value[0] - min[0]) / width, (value[1] - min[1]) / height];
        let contour = VectorContour {
            id: Uuid::now_v7(),
            closed,
            points: points
                .into_iter()
                .map(|point| VectorPoint {
                    id: Uuid::now_v7(),
                    position: normalize(point.position),
                    handle_in: point.handle_in.map(normalize),
                    handle_out: point.handle_out.map(normalize),
                    point_type: point.point_type,
                })
                .collect(),
        };
        let id = self.add_vector_shape(
            VectorGeometry::Path {
                contours: vec![contour],
            },
            parent_id,
        );
        let node = self.active_node_mut(id).expect("inserted path exists");
        node.x = min[0];
        node.y = min[1];
        node.width = width;
        node.height = height;
        if !closed {
            node.fill[3] = 0.0;
            node.stroke = [0.46, 0.91, 0.72, 1.0];
            node.stroke_width = 2.0;
        }
        self.reframe_vector_path(id);
        Some(id)
    }

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
        let mut split_point = contour.points[point_index].clone();
        split_point.id = Uuid::now_v7();
        let right = contour.points.split_off(point_index);
        contour.points.push(split_point);
        contours.insert(
            contour_index + 1,
            VectorContour {
                id: Uuid::now_v7(),
                points: right,
                closed: false,
            },
        );
        true
    }

    pub(crate) fn vector_point_indices(
        &self,
        node_id: EntityId,
        contour_id: EntityId,
        point_id: EntityId,
    ) -> Option<(usize, usize)> {
        let node = self.active_node(node_id)?;
        let VectorGeometry::Path { contours } = &node.vector.as_ref()?.geometry else {
            return None;
        };
        let contour_index = contours
            .iter()
            .position(|contour| contour.id == contour_id)?;
        let point_index = contours[contour_index]
            .points
            .iter()
            .position(|point| point.id == point_id)?;
        Some((contour_index, point_index))
    }

    pub(crate) fn move_vector_point_by_id(
        &mut self,
        node_id: EntityId,
        contour_id: EntityId,
        point_id: EntityId,
        x: f32,
        y: f32,
    ) -> bool {
        let Some((contour_index, point_index)) =
            self.vector_point_indices(node_id, contour_id, point_id)
        else {
            return false;
        };
        self.move_vector_point(node_id, contour_index, point_index, x, y)
    }

    pub(crate) fn delete_vector_point_by_id(
        &mut self,
        node_id: EntityId,
        contour_id: EntityId,
        point_id: EntityId,
    ) -> bool {
        let Some((contour_index, point_index)) =
            self.vector_point_indices(node_id, contour_id, point_id)
        else {
            return false;
        };
        self.delete_vector_point(node_id, contour_index, point_index)
    }

    pub(crate) fn cut_vector_path_by_id(
        &mut self,
        node_id: EntityId,
        contour_id: EntityId,
        point_id: EntityId,
    ) -> bool {
        let Some((contour_index, point_index)) =
            self.vector_point_indices(node_id, contour_id, point_id)
        else {
            return false;
        };
        self.cut_vector_path(node_id, contour_index, point_index)
    }

    pub(crate) fn move_vector_handle_by_id(
        &mut self,
        node_id: EntityId,
        contour_id: EntityId,
        point_id: EntityId,
        handle_out: bool,
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
            .iter_mut()
            .find(|contour| contour.id == contour_id)
            .and_then(|contour| contour.points.iter_mut().find(|point| point.id == point_id))
        else {
            return false;
        };
        let next = [x.clamp(-10.0, 10.0), y.clamp(-10.0, 10.0)];
        let previous = if handle_out {
            point.handle_out
        } else {
            point.handle_in
        };
        if previous == Some(next) {
            return false;
        }
        let delta = [next[0] - point.position[0], next[1] - point.position[1]];
        if handle_out {
            point.handle_out = Some(next);
        } else {
            point.handle_in = Some(next);
        }
        if point.point_type != VectorPointType::Corner {
            let other = if handle_out {
                &mut point.handle_in
            } else {
                &mut point.handle_out
            };
            let old_length = other
                .map(|other| {
                    ((other[0] - point.position[0]).powi(2)
                        + (other[1] - point.position[1]).powi(2))
                    .sqrt()
                })
                .unwrap_or_else(|| (delta[0].powi(2) + delta[1].powi(2)).sqrt());
            let length = (delta[0].powi(2) + delta[1].powi(2)).sqrt();
            if length > f32::EPSILON {
                let other_length = if point.point_type == VectorPointType::Symmetric {
                    length
                } else {
                    old_length
                };
                *other = Some([
                    point.position[0] - delta[0] / length * other_length,
                    point.position[1] - delta[1] / length * other_length,
                ]);
            }
        }
        true
    }

    pub(crate) fn set_vector_point_type_by_id(
        &mut self,
        node_id: EntityId,
        contour_id: EntityId,
        point_id: EntityId,
        point_type: VectorPointType,
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
        let Some(contour) = contours.iter_mut().find(|contour| contour.id == contour_id) else {
            return false;
        };
        let Some(point_index) = contour.points.iter().position(|point| point.id == point_id) else {
            return false;
        };
        if contour.points[point_index].point_type == point_type {
            return false;
        }
        let count = contour.points.len();
        let previous_index = if point_index > 0 {
            Some(point_index - 1)
        } else if contour.closed {
            Some(count - 1)
        } else {
            None
        };
        let next_index = if point_index + 1 < count {
            Some(point_index + 1)
        } else if contour.closed {
            Some(0)
        } else {
            None
        };
        let position = contour.points[point_index].position;
        let previous = previous_index.map(|index| contour.points[index].position);
        let next = next_index.map(|index| contour.points[index].position);
        let point = &mut contour.points[point_index];
        point.point_type = point_type;
        if point_type != VectorPointType::Corner
            && (point.handle_in.is_none() || point.handle_out.is_none())
        {
            let tangent = match (previous, next) {
                (Some(previous), Some(next)) => [next[0] - previous[0], next[1] - previous[1]],
                (Some(previous), None) => [position[0] - previous[0], position[1] - previous[1]],
                (None, Some(next)) => [next[0] - position[0], next[1] - position[1]],
                _ => [0.2, 0.0],
            };
            let length = (tangent[0].powi(2) + tangent[1].powi(2)).sqrt();
            let scale = if length > f32::EPSILON {
                0.16 / length
            } else {
                0.16
            };
            let offset = [tangent[0] * scale, tangent[1] * scale];
            point.handle_in = Some([position[0] - offset[0], position[1] - offset[1]]);
            point.handle_out = Some([position[0] + offset[0], position[1] + offset[1]]);
        } else if point_type == VectorPointType::Symmetric
            && let Some(handle_out) = point.handle_out
        {
            point.handle_in = Some([
                position[0] * 2.0 - handle_out[0],
                position[1] * 2.0 - handle_out[1],
            ]);
        }
        true
    }

    pub(crate) fn insert_vector_point_by_id(
        &mut self,
        node_id: EntityId,
        contour_id: EntityId,
        start_point_id: EntityId,
        t: f32,
    ) -> Option<EntityId> {
        if !t.is_finite() {
            return None;
        }
        let node = self.active_node_mut(node_id)?;
        if node.locked || node.kind != NodeKind::Vector {
            return None;
        }
        let VectorGeometry::Path { contours } = &mut node.vector.as_mut()?.geometry else {
            return None;
        };
        let contour = contours
            .iter_mut()
            .find(|contour| contour.id == contour_id)?;
        let start_index = contour
            .points
            .iter()
            .position(|point| point.id == start_point_id)?;
        let end_index = if start_index + 1 < contour.points.len() {
            start_index + 1
        } else if contour.closed {
            0
        } else {
            return None;
        };
        let t = t.clamp(0.001, 0.999);
        let start = contour.points[start_index].clone();
        let end = contour.points[end_index].clone();
        let curved = start.handle_out.is_some() || end.handle_in.is_some();
        let p0 = start.position;
        let p1 = start.handle_out.unwrap_or(p0);
        let p3 = end.position;
        let p2 = end.handle_in.unwrap_or(p3);
        let q0 = lerp_point(p0, p1, t);
        let q1 = lerp_point(p1, p2, t);
        let q2 = lerp_point(p2, p3, t);
        let r0 = lerp_point(q0, q1, t);
        let r1 = lerp_point(q1, q2, t);
        let position = lerp_point(r0, r1, t);
        if curved {
            contour.points[start_index].handle_out = Some(q0);
            contour.points[end_index].handle_in = Some(q2);
        }
        let id = Uuid::now_v7();
        let point = VectorPoint {
            id,
            position,
            handle_in: curved.then_some(r0),
            handle_out: curved.then_some(r1),
            point_type: if curved {
                VectorPointType::Smooth
            } else {
                VectorPointType::Corner
            },
        };
        contour.points.insert(start_index + 1, point);
        Some(id)
    }

    pub(crate) fn cut_vector_segment_by_id(
        &mut self,
        node_id: EntityId,
        contour_id: EntityId,
        start_point_id: EntityId,
        t: f32,
    ) -> Option<EntityId> {
        let point_id = self.insert_vector_point_by_id(node_id, contour_id, start_point_id, t)?;
        self.cut_vector_path_by_id(node_id, contour_id, point_id)
            .then_some(point_id)
    }

    pub(crate) fn knife_vector_path(
        &mut self,
        node_id: EntityId,
        world_start: [f32; 2],
        world_end: [f32; 2],
    ) -> bool {
        if world_start
            .iter()
            .chain(world_end.iter())
            .any(|value| !value.is_finite())
            || (world_end[0] - world_start[0]).hypot(world_end[1] - world_start[1]) < 1.0
        {
            return false;
        }
        let Some(node) = self.active_node(node_id) else {
            return false;
        };
        if node.locked || node.kind != NodeKind::Vector {
            return false;
        }
        let to_local = |world: [f32; 2]| {
            let angle = -node.rotation.to_radians();
            let dx = world[0] - node.x - node.width / 2.0;
            let dy = world[1] - node.y - node.height / 2.0;
            let mut x = dx * angle.cos() - dy * angle.sin();
            let mut y = dx * angle.sin() + dy * angle.cos();
            if node.flip_x {
                x = -x;
            }
            if node.flip_y {
                y = -y;
            }
            [x / node.width + 0.5, y / node.height + 0.5]
        };
        let knife_start = to_local(world_start);
        let knife_end = to_local(world_end);
        let VectorGeometry::Path { contours } = &node.vector.as_ref().map(|v| &v.geometry).unwrap()
        else {
            return false;
        };
        let mut selected = None;
        for contour in contours.iter().filter(|contour| contour.closed) {
            let mut intersections = Vec::new();
            for index in 0..contour.points.len() {
                let from = &contour.points[index];
                let to = &contour.points[(index + 1) % contour.points.len()];
                let p0 = from.position;
                let p1 = from.handle_out.unwrap_or(p0);
                let p3 = to.position;
                let p2 = to.handle_in.unwrap_or(p3);
                let steps = if from.handle_out.is_some() || to.handle_in.is_some() {
                    64
                } else {
                    1
                };
                let mut previous = p0;
                for step in 1..=steps {
                    let next_t = step as f32 / steps as f32;
                    let next = cubic_value(p0, p1, p2, p3, next_t);
                    if let Some((segment_t, knife_t)) =
                        line_segment_intersection(previous, next, knife_start, knife_end)
                    {
                        let previous_t = (step - 1) as f32 / steps as f32;
                        let curve_t = previous_t + (next_t - previous_t) * segment_t;
                        if !intersections
                            .iter()
                            .any(|(_, _, existing): &(EntityId, f32, f32)| {
                                (*existing - knife_t).abs() < 0.001
                            })
                        {
                            intersections.push((from.id, curve_t, knife_t));
                        }
                    }
                    previous = next;
                }
            }
            intersections.sort_by(|left, right| left.2.total_cmp(&right.2));
            if intersections.len() >= 2 {
                let cuts = vec![intersections[0], *intersections.last().unwrap()];
                if cuts[0].0 != cuts[1].0 {
                    selected = Some((contour.id, cuts));
                    break;
                }
            }
        }
        let Some((contour_id, cuts)) = selected else {
            return false;
        };
        let Some(first_id) =
            self.insert_vector_point_by_id(node_id, contour_id, cuts[0].0, cuts[0].1)
        else {
            return false;
        };
        let Some(second_id) =
            self.insert_vector_point_by_id(node_id, contour_id, cuts[1].0, cuts[1].1)
        else {
            return false;
        };
        let Some(node) = self.active_node_mut(node_id) else {
            return false;
        };
        let Some(VectorGeometry::Path { contours }) =
            node.vector.as_mut().map(|vector| &mut vector.geometry)
        else {
            return false;
        };
        let Some(contour_index) = contours.iter().position(|contour| contour.id == contour_id)
        else {
            return false;
        };
        let source = contours.remove(contour_index);
        let Some(mut first_index) = source.points.iter().position(|point| point.id == first_id)
        else {
            return false;
        };
        let Some(mut second_index) = source.points.iter().position(|point| point.id == second_id)
        else {
            return false;
        };
        if first_index > second_index {
            std::mem::swap(&mut first_index, &mut second_index);
        }
        let mut first_points = source.points[first_index..=second_index].to_vec();
        let mut second_points = source.points[second_index..]
            .iter()
            .chain(source.points[..=first_index].iter())
            .cloned()
            .collect::<Vec<_>>();
        first_points.first_mut().unwrap().handle_in = None;
        first_points.last_mut().unwrap().handle_out = None;
        second_points.first_mut().unwrap().handle_in = None;
        second_points.last_mut().unwrap().handle_out = None;
        second_points.first_mut().unwrap().id = Uuid::now_v7();
        second_points.last_mut().unwrap().id = Uuid::now_v7();
        contours.insert(
            contour_index,
            VectorContour {
                id: source.id,
                points: first_points,
                closed: true,
            },
        );
        contours.insert(
            contour_index + 1,
            VectorContour {
                id: Uuid::now_v7(),
                points: second_points,
                closed: true,
            },
        );
        self.reframe_vector_path(node_id);
        true
    }

    pub(crate) fn reframe_vector_path(&mut self, node_id: EntityId) -> bool {
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
        let Some((min, max)) = path_curve_bounds(contours, node.width, node.height) else {
            return false;
        };
        let width = (max[0] - min[0]).max(1.0);
        let height = (max[1] - min[1]).max(1.0);
        if min[0].abs() < 0.0001
            && min[1].abs() < 0.0001
            && (width - node.width).abs() < 0.0001
            && (height - node.height).abs() < 0.0001
        {
            return false;
        }
        let old_width = node.width;
        let old_height = node.height;
        let local_center = [
            min[0] + width / 2.0 - old_width / 2.0,
            min[1] + height / 2.0 - old_height / 2.0,
        ];
        let flipped = [
            if node.flip_x {
                -local_center[0]
            } else {
                local_center[0]
            },
            if node.flip_y {
                -local_center[1]
            } else {
                local_center[1]
            },
        ];
        let angle = node.rotation.to_radians();
        let old_center = [node.x + old_width / 2.0, node.y + old_height / 2.0];
        let new_center = [
            old_center[0] + flipped[0] * angle.cos() - flipped[1] * angle.sin(),
            old_center[1] + flipped[0] * angle.sin() + flipped[1] * angle.cos(),
        ];
        for point in contours.iter_mut().flat_map(|contour| &mut contour.points) {
            point.position = [
                (point.position[0] * old_width - min[0]) / width,
                (point.position[1] * old_height - min[1]) / height,
            ];
            if let Some(handle) = &mut point.handle_in {
                *handle = [
                    (handle[0] * old_width - min[0]) / width,
                    (handle[1] * old_height - min[1]) / height,
                ];
            }
            if let Some(handle) = &mut point.handle_out {
                *handle = [
                    (handle[0] * old_width - min[0]) / width,
                    (handle[1] * old_height - min[1]) / height,
                ];
            }
        }
        node.x = new_center[0] - width / 2.0;
        node.y = new_center[1] - height / 2.0;
        node.width = width;
        node.height = height;
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
                id: a.id,
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

fn lerp_point(a: [f32; 2], b: [f32; 2], t: f32) -> [f32; 2] {
    [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]
}

fn cubic_value(p0: [f32; 2], p1: [f32; 2], p2: [f32; 2], p3: [f32; 2], t: f32) -> [f32; 2] {
    let inverse = 1.0 - t;
    [
        inverse.powi(3) * p0[0]
            + 3.0 * inverse.powi(2) * t * p1[0]
            + 3.0 * inverse * t.powi(2) * p2[0]
            + t.powi(3) * p3[0],
        inverse.powi(3) * p0[1]
            + 3.0 * inverse.powi(2) * t * p1[1]
            + 3.0 * inverse * t.powi(2) * p2[1]
            + t.powi(3) * p3[1],
    ]
}

fn line_segment_intersection(
    a: [f32; 2],
    b: [f32; 2],
    c: [f32; 2],
    d: [f32; 2],
) -> Option<(f32, f32)> {
    let ab = [b[0] - a[0], b[1] - a[1]];
    let cd = [d[0] - c[0], d[1] - c[1]];
    let denominator = ab[0] * cd[1] - ab[1] * cd[0];
    if denominator.abs() < 0.000001 {
        return None;
    }
    let offset = [c[0] - a[0], c[1] - a[1]];
    let segment_t = (offset[0] * cd[1] - offset[1] * cd[0]) / denominator;
    let knife_t = (offset[0] * ab[1] - offset[1] * ab[0]) / denominator;
    ((0.0..=1.0).contains(&segment_t) && (0.0..=1.0).contains(&knife_t))
        .then_some((segment_t, knife_t))
}

fn path_curve_bounds(
    contours: &[VectorContour],
    width: f32,
    height: f32,
) -> Option<([f32; 2], [f32; 2])> {
    let mut min = [f32::INFINITY; 2];
    let mut max = [f32::NEG_INFINITY; 2];
    let mut include = |point: [f32; 2]| {
        min[0] = min[0].min(point[0]);
        min[1] = min[1].min(point[1]);
        max[0] = max[0].max(point[0]);
        max[1] = max[1].max(point[1]);
    };
    let mut found = false;
    for contour in contours {
        let segment_count = if contour.closed {
            contour.points.len()
        } else {
            contour.points.len().saturating_sub(1)
        };
        for index in 0..segment_count {
            found = true;
            let from = &contour.points[index];
            let to = &contour.points[(index + 1) % contour.points.len()];
            let scale = |point: [f32; 2]| [point[0] * width, point[1] * height];
            let p0 = scale(from.position);
            let p1 = scale(from.handle_out.unwrap_or(from.position));
            let p3 = scale(to.position);
            let p2 = scale(to.handle_in.unwrap_or(to.position));
            include(p0);
            include(p3);
            for axis in 0..2 {
                for t in cubic_extrema(p0[axis], p1[axis], p2[axis], p3[axis]) {
                    let inverse = 1.0 - t;
                    include([
                        inverse.powi(3) * p0[0]
                            + 3.0 * inverse.powi(2) * t * p1[0]
                            + 3.0 * inverse * t.powi(2) * p2[0]
                            + t.powi(3) * p3[0],
                        inverse.powi(3) * p0[1]
                            + 3.0 * inverse.powi(2) * t * p1[1]
                            + 3.0 * inverse * t.powi(2) * p2[1]
                            + t.powi(3) * p3[1],
                    ]);
                }
            }
        }
    }
    found.then_some((min, max))
}

fn cubic_extrema(p0: f32, p1: f32, p2: f32, p3: f32) -> Vec<f32> {
    let a = 3.0 * (-p0 + 3.0 * p1 - 3.0 * p2 + p3);
    let b = 6.0 * (p0 - 2.0 * p1 + p2);
    let c = 3.0 * (p1 - p0);
    if a.abs() < 0.000001 {
        if b.abs() < 0.000001 {
            return Vec::new();
        }
        let t = -c / b;
        return (t > 0.0 && t < 1.0).then_some(t).into_iter().collect();
    }
    let discriminant = b * b - 4.0 * a * c;
    if discriminant < 0.0 {
        return Vec::new();
    }
    let root = discriminant.sqrt();
    [(-b + root) / (2.0 * a), (-b - root) / (2.0 * a)]
        .into_iter()
        .filter(|t| *t > 0.0 && *t < 1.0)
        .collect()
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
                id: Uuid::now_v7(),
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
                id: Uuid::now_v7(),
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
        id: Uuid::now_v7(),
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
        id: Uuid::now_v7(),
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
