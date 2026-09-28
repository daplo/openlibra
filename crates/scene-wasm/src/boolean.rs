//! Non-destructive boolean groups. Original operands retain curves; derived
//! boundaries are polygonal with 0.05 document-pixel flattening tolerance.
use crate::*;
use i_overlay::{
    core::{fill_rule::FillRule as OverlayFill, overlay_rule::OverlayRule},
    float::{simplify::SimplifyShape, single::SingleFloatOverlay},
};
type Point = [f64; 2];
type Shapes = Vec<Vec<Vec<Point>>>;
const TOLERANCE: f64 = 0.05;
const MAX_POINTS: usize = 131072;

pub(crate) fn supported(node: &Node) -> bool {
    node.boolean_operation.is_some() || crate::edit::mask_geometry_supported(node)
}
impl Document {
    pub(crate) fn has_booleans(&self) -> bool {
        self.pages
            .iter()
            .any(|p| p.nodes.iter().any(|n| n.boolean_operation.is_some()))
    }
    pub(crate) fn create_boolean(
        &mut self,
        ids: &[EntityId],
        operation: BooleanOperation,
    ) -> Result<EntityId, String> {
        let selected: Vec<_> = self
            .active_page()
            .nodes
            .iter()
            .filter(|n| ids.contains(&n.id))
            .cloned()
            .collect();
        if selected.len() < 2 || selected.len() > 64 {
            return Err("Select 2 to 64 closed shapes".into());
        }
        let first = &selected[0];
        if selected.iter().any(|n| {
            !supported(n)
                || n.parent_id != first.parent_id
                || n.locked
                || n.mask_shape
                || n.instance_root_id.is_some()
                || n.component_id.is_some()
        }) {
            return Err(
                "Select unlocked closed shapes in the same container, outside component instances"
                    .into(),
            );
        }
        // Validate geometry and limits before adding a container.
        let result = combine(&selected, operation)?;
        let top = selected.last().unwrap().id;
        let group = self.group_nodes(ids).ok_or("Could not group shapes")?;
        let root = self.active_node_mut(group).unwrap();
        root.name = format!("Boolean / {operation:?}");
        root.boolean_operation = Some(operation);
        root.fill = first.fill;
        root.stroke = first.stroke;
        root.stroke_width = first.stroke_width;
        root.stroke_align = StrokeAlign::Center;
        root.stroke_join = first.stroke_join;
        root.vector = Some(result_vector(root, result));
        let nodes = &mut self.active_page_mut().nodes;
        let i = nodes.iter().position(|n| n.id == group).unwrap();
        let node = nodes.remove(i);
        let i = nodes.iter().position(|n| n.id == top).unwrap();
        nodes.insert(i + 1, node);
        Ok(group)
    }
    pub(crate) fn sync_booleans(&mut self) -> Result<(), String> {
        for page in &mut self.pages {
            let mut groups: Vec<_> = page
                .nodes
                .iter()
                .filter(|n| n.boolean_operation.is_some())
                .map(|n| {
                    let mut depth = 0;
                    let mut parent = n.parent_id;
                    while let Some(id) = parent {
                        depth += 1;
                        if depth > page.nodes.len() {
                            return (n.id, depth);
                        }
                        parent = page
                            .nodes
                            .iter()
                            .find(|p| p.id == id)
                            .and_then(|p| p.parent_id);
                    }
                    (n.id, depth)
                })
                .collect();
            groups.sort_by_key(|(_, depth)| std::cmp::Reverse(*depth));
            for (id, _) in groups {
                let operands: Vec<_> = page
                    .nodes
                    .iter()
                    .filter(|n| n.parent_id == Some(id))
                    .cloned()
                    .collect();
                if operands.len() > 64 || operands.iter().any(|n| !supported(n) || n.mask_shape) {
                    return Err("Boolean operands must be closed shapes (maximum 64)".into());
                }
                let root = page.nodes.iter_mut().find(|n| n.id == id).unwrap();
                root.vector = Some(result_vector(
                    root,
                    combine(&operands, root.boolean_operation.unwrap())?,
                ));
            }
        }
        Ok(())
    }
}
fn combine(nodes: &[Node], mode: BooleanOperation) -> Result<Shapes, String> {
    let mut iter = nodes.iter();
    let Some(first) = iter.next() else {
        return Ok(vec![]);
    };
    let mut result = shape(first)?;
    let rule = match mode {
        BooleanOperation::Union => OverlayRule::Union,
        BooleanOperation::Subtract => OverlayRule::Difference,
        BooleanOperation::Intersect => OverlayRule::Intersect,
        BooleanOperation::Exclude => OverlayRule::Xor,
    };
    for node in iter {
        result = result.overlay(&shape(node)?, rule, OverlayFill::EvenOdd);
        if result.iter().flatten().map(Vec::len).sum::<usize>() > MAX_POINTS {
            return Err("Boolean result exceeds the geometry limit".into());
        }
    }
    Ok(result)
}
fn world(node: &Node, p: Point) -> Point {
    let dx = (p[0] - node.width as f64 / 2.0) * if node.flip_x { -1.0 } else { 1.0 };
    let dy = (p[1] - node.height as f64 / 2.0) * if node.flip_y { -1.0 } else { 1.0 };
    let a = (node.rotation as f64).to_radians();
    [
        node.x as f64 + node.width as f64 / 2.0 + dx * a.cos() - dy * a.sin(),
        node.y as f64 + node.height as f64 / 2.0 + dx * a.sin() + dy * a.cos(),
    ]
}
fn result_vector(node: &Node, result: Shapes) -> VectorData {
    let a = -(node.rotation as f64).to_radians();
    let contours = result
        .into_iter()
        .flatten()
        .filter(|c| c.len() >= 3)
        .map(|c| VectorContour {
            closed: true,
            points: c
                .into_iter()
                .map(|p| {
                    let dx = p[0] - node.x as f64 - node.width as f64 / 2.0;
                    let dy = p[1] - node.y as f64 - node.height as f64 / 2.0;
                    VectorPoint {
                        position: [
                            (((dx * a.cos() - dy * a.sin()) * if node.flip_x { -1.0 } else { 1.0 })
                                / node.width as f64
                                + 0.5) as f32,
                            (((dx * a.sin() + dy * a.cos()) * if node.flip_y { -1.0 } else { 1.0 })
                                / node.height as f64
                                + 0.5) as f32,
                        ],
                        handle_in: None,
                        handle_out: None,
                        point_type: VectorPointType::Corner,
                    }
                })
                .collect(),
        })
        .collect();
    VectorData {
        geometry: VectorGeometry::Path { contours },
        fill_rule: FillRule::Evenodd,
    }
}
fn shape(node: &Node) -> Result<Shapes, String> {
    let w = node.width as f64;
    let h = node.height as f64;
    let mut paths: Vec<Vec<Point>> = vec![];
    if node.kind == NodeKind::Rectangle {
        let mut r = node.corner_radii.map(|v| v as f64);
        let factor = [
            w / (r[0] + r[1]),
            w / (r[2] + r[3]),
            h / (r[0] + r[3]),
            h / (r[1] + r[2]),
        ]
        .into_iter()
        .fold(1.0, f64::min);
        for v in &mut r {
            *v *= factor;
        }
        let mut path = vec![];
        for (cx, cy, radius, start) in [
            (w - r[1], r[1], r[1], -std::f64::consts::FRAC_PI_2),
            (w - r[2], h - r[2], r[2], 0.0),
            (r[3], h - r[3], r[3], std::f64::consts::FRAC_PI_2),
            (r[0], r[0], r[0], std::f64::consts::PI),
        ] {
            let steps = arc_steps(radius, std::f64::consts::FRAC_PI_2)?;
            for i in 0..=steps {
                let a = start + std::f64::consts::FRAC_PI_2 * i as f64 / steps as f64;
                path.push(world(node, [cx + radius * a.cos(), cy + radius * a.sin()]));
            }
        }
        paths.push(path);
    } else if let Some(vector) = &node.vector {
        match &vector.geometry {
            VectorGeometry::Ellipse => {
                let steps = arc_steps(w.max(h) / 2.0, std::f64::consts::TAU)?;
                paths.push(
                    (0..steps)
                        .map(|i| {
                            let a = std::f64::consts::TAU * i as f64 / steps as f64;
                            world(
                                node,
                                [w / 2.0 + w / 2.0 * a.cos(), h / 2.0 + h / 2.0 * a.sin()],
                            )
                        })
                        .collect(),
                );
            }
            VectorGeometry::Polygon { sides } | VectorGeometry::Star { points: sides, .. } => {
                let (count, inner) = if let VectorGeometry::Star {
                    points,
                    inner_ratio,
                } = &vector.geometry
                {
                    (*points as usize * 2, *inner_ratio as f64)
                } else {
                    (*sides as usize, 1.0)
                };
                paths.push(
                    (0..count)
                        .map(|i| {
                            let a = -std::f64::consts::FRAC_PI_2
                                + std::f64::consts::TAU * i as f64 / count as f64;
                            let r = w.min(h) / 2.0 * if i % 2 == 1 { inner } else { 1.0 };
                            world(node, [w / 2.0 + r * a.cos(), h / 2.0 + r * a.sin()])
                        })
                        .collect(),
                );
            }
            VectorGeometry::Path { contours } => {
                for c in contours {
                    if !c.closed {
                        return Err("Open paths cannot be boolean operands".into());
                    }
                    let mut path = vec![];
                    if let Some(first) = c.points.first() {
                        path.push(world(
                            node,
                            [first.position[0] as f64 * w, first.position[1] as f64 * h],
                        ));
                    }
                    for i in 0..c.points.len() {
                        let a = &c.points[i];
                        let b = &c.points[(i + 1) % c.points.len()];
                        let pts = [
                            a.position,
                            a.handle_out.unwrap_or(a.position),
                            b.handle_in.unwrap_or(b.position),
                            b.position,
                        ]
                        .map(|p| world(node, [p[0] as f64 * w, p[1] as f64 * h]));
                        flatten(pts, 0, &mut path)?;
                    }
                    paths.push(path);
                }
            }
            _ => return Err("Open paths cannot be boolean operands".into()),
        }
    } else {
        return Err("Unsupported boolean operand".into());
    }
    if paths.iter().map(Vec::len).sum::<usize>() > MAX_POINTS {
        return Err("Boolean operand exceeds the geometry limit".into());
    }
    let fill = if node
        .vector
        .as_ref()
        .is_some_and(|v| v.fill_rule == FillRule::Evenodd)
    {
        OverlayFill::EvenOdd
    } else {
        OverlayFill::NonZero
    };
    Ok(paths.simplify_shape(fill))
}
fn arc_steps(radius: f64, angle: f64) -> Result<usize, String> {
    let steps = if radius <= TOLERANCE {
        1
    } else {
        (angle / (2.0 * (1.0 - TOLERANCE / radius).acos())).ceil() as usize
    };
    if steps > 32768 {
        return Err("Curve is too large for boolean precision limits".into());
    }
    Ok(steps.max(1))
}
fn flatten(p: [Point; 4], depth: u8, out: &mut Vec<Point>) -> Result<(), String> {
    if out.len() >= MAX_POINTS {
        return Err("Curve exceeds boolean geometry limit".into());
    }
    let d = [p[3][0] - p[0][0], p[3][1] - p[0][1]];
    let length = d[0].hypot(d[1]);
    let distance = |q: Point| {
        if length == 0.0 {
            (q[0] - p[0][0]).hypot(q[1] - p[0][1])
        } else {
            ((q[0] - p[0][0]) * d[1] - (q[1] - p[0][1]) * d[0]).abs() / length
        }
    };
    // Control polygon length also catches collinear curves that double back.
    let polygon = (p[1][0] - p[0][0]).hypot(p[1][1] - p[0][1])
        + (p[2][0] - p[1][0]).hypot(p[2][1] - p[1][1])
        + (p[3][0] - p[2][0]).hypot(p[3][1] - p[2][1]);
    if distance(p[1]).max(distance(p[2])) <= TOLERANCE && polygon - length <= TOLERANCE {
        out.push(p[3]);
        return Ok(());
    }
    if depth >= 20 {
        return Err("Curve exceeds boolean precision limits".into());
    }
    let mid = |a: Point, b: Point| [(a[0] + b[0]) / 2.0, (a[1] + b[1]) / 2.0];
    let a = mid(p[0], p[1]);
    let b = mid(p[1], p[2]);
    let c = mid(p[2], p[3]);
    let d = mid(a, b);
    let e = mid(b, c);
    let f = mid(d, e);
    flatten([p[0], a, d, f], depth + 1, out)?;
    flatten([f, e, c, p[3]], depth + 1, out)
}
