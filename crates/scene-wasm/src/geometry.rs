use crate::{FillRule, Node, VectorGeometry, VectorPoint};

pub(crate) fn point_in_rotated_node(node: &Node, x: f32, y: f32) -> bool {
    let center_x = node.x + node.width / 2.0;
    let center_y = node.y + node.height / 2.0;
    let angle = -node.rotation.to_radians();
    let dx = x - center_x;
    let dy = y - center_y;
    let local_x = dx * angle.cos() - dy * angle.sin() + center_x;
    let local_y = dx * angle.sin() + dy * angle.cos() + center_y;
    local_x >= node.x
        && local_y >= node.y
        && local_x <= node.x + node.width
        && local_y <= node.y + node.height
}

pub(crate) fn point_in_vector_node(node: &Node, x: f32, y: f32) -> bool {
    let Some(vector) = &node.vector else {
        return false;
    };
    let center_x = node.x + node.width / 2.0;
    let center_y = node.y + node.height / 2.0;
    let angle = -node.rotation.to_radians();
    let dx = x - center_x;
    let dy = y - center_y;
    let mut local_x = dx * angle.cos() - dy * angle.sin();
    let mut local_y = dx * angle.sin() + dy * angle.cos();
    if node.flip_x {
        local_x = -local_x;
    }
    if node.flip_y {
        local_y = -local_y;
    }
    local_x += node.width / 2.0;
    local_y += node.height / 2.0;
    let target = [local_x, local_y];
    let stroke_tolerance = if node.stroke_width > 0.0 {
        node.stroke_width / 2.0 + 3.0
    } else {
        4.0
    };

    match &vector.geometry {
        VectorGeometry::Ellipse => {
            let rx = node.width / 2.0;
            let ry = node.height / 2.0;
            if rx <= 0.0 || ry <= 0.0 {
                return false;
            }
            let normalized = ((local_x - rx) / rx).powi(2) + ((local_y - ry) / ry).powi(2);
            (node.fill[3] > 0.0 && normalized <= 1.0)
                || (node.stroke_width > 0.0
                    && (normalized.sqrt() - 1.0).abs() * rx.min(ry) <= stroke_tolerance)
        }
        VectorGeometry::Line => {
            point_segment_distance(
                target,
                [0.0, node.height / 2.0],
                [node.width, node.height / 2.0],
            ) <= stroke_tolerance
        }
        VectorGeometry::Polygon { sides } => {
            let points = regular_shape_local(*sides as usize, 1.0, node.width, node.height);
            point_in_polyline(target, &points, true, vector.fill_rule, node.fill[3] > 0.0)
                || polyline_stroke_hit(target, &points, true, stroke_tolerance)
        }
        VectorGeometry::Star {
            points,
            inner_ratio,
        } => {
            let points =
                regular_shape_local(*points as usize * 2, *inner_ratio, node.width, node.height);
            point_in_polyline(target, &points, true, vector.fill_rule, node.fill[3] > 0.0)
                || polyline_stroke_hit(target, &points, true, stroke_tolerance)
        }
        VectorGeometry::Path { contours } => {
            let flattened: Vec<_> = contours
                .iter()
                .map(|contour| {
                    (
                        flatten_contour(&contour.points, contour.closed, node.width, node.height),
                        contour.closed,
                    )
                })
                .collect();
            let fill_hit = node.fill[3] > 0.0
                && match vector.fill_rule {
                    FillRule::Evenodd => {
                        flattened
                            .iter()
                            .filter(|(points, closed)| {
                                *closed
                                    && point_in_polyline(
                                        target,
                                        points,
                                        true,
                                        FillRule::Evenodd,
                                        true,
                                    )
                            })
                            .count()
                            % 2
                            == 1
                    }
                    FillRule::Nonzero => {
                        flattened
                            .iter()
                            .filter(|(_, closed)| *closed)
                            .map(|(points, _)| winding_number(target, points))
                            .sum::<i32>()
                            != 0
                    }
                };
            fill_hit
                || flattened.iter().any(|(points, closed)| {
                    polyline_stroke_hit(target, points, *closed, stroke_tolerance)
                })
        }
    }
}

fn regular_shape_local(count: usize, inner_ratio: f32, width: f32, height: f32) -> Vec<[f32; 2]> {
    let outer = width.min(height) / 2.0;
    (0..count)
        .map(|index| {
            let radius = if index % 2 == 1 { inner_ratio } else { 1.0 } * outer;
            let angle =
                -std::f32::consts::FRAC_PI_2 + index as f32 * std::f32::consts::TAU / count as f32;
            [
                width / 2.0 + angle.cos() * radius,
                height / 2.0 + angle.sin() * radius,
            ]
        })
        .collect()
}

fn flatten_contour(points: &[VectorPoint], closed: bool, width: f32, height: f32) -> Vec<[f32; 2]> {
    let mut result = Vec::new();
    let Some(first) = points.first() else {
        return result;
    };
    result.push([first.position[0] * width, first.position[1] * height]);
    let count = if closed {
        points.len()
    } else {
        points.len().saturating_sub(1)
    };
    for index in 0..count {
        let from = &points[index];
        let to = &points[(index + 1) % points.len()];
        let p0 = [from.position[0] * width, from.position[1] * height];
        let p3 = [to.position[0] * width, to.position[1] * height];
        let p1 = from
            .handle_out
            .map(|point| [point[0] * width, point[1] * height])
            .unwrap_or(p0);
        let p2 = to
            .handle_in
            .map(|point| [point[0] * width, point[1] * height])
            .unwrap_or(p3);
        let steps = if from.handle_out.is_some() || to.handle_in.is_some() {
            20
        } else {
            1
        };
        for step in 1..=steps {
            let t = step as f32 / steps as f32;
            let inverse = 1.0 - t;
            result.push([
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
    result
}

fn point_in_polyline(
    point: [f32; 2],
    vertices: &[[f32; 2]],
    closed: bool,
    _fill_rule: FillRule,
    fill_visible: bool,
) -> bool {
    if !closed || !fill_visible || vertices.len() < 3 {
        return false;
    }
    let mut inside = false;
    let mut previous = vertices.len() - 1;
    for current in 0..vertices.len() {
        let a = vertices[current];
        let b = vertices[previous];
        if ((a[1] > point[1]) != (b[1] > point[1]))
            && point[0] < (b[0] - a[0]) * (point[1] - a[1]) / (b[1] - a[1] + f32::EPSILON) + a[0]
        {
            inside = !inside;
        }
        previous = current;
    }
    inside
}

fn winding_number(point: [f32; 2], vertices: &[[f32; 2]]) -> i32 {
    if vertices.len() < 3 {
        return 0;
    }
    let mut winding = 0;
    for index in 0..vertices.len() {
        let start = vertices[index];
        let end = vertices[(index + 1) % vertices.len()];
        let cross = (end[0] - start[0]) * (point[1] - start[1])
            - (point[0] - start[0]) * (end[1] - start[1]);
        if start[1] <= point[1] {
            if end[1] > point[1] && cross > 0.0 {
                winding += 1;
            }
        } else if end[1] <= point[1] && cross < 0.0 {
            winding -= 1;
        }
    }
    winding
}

fn polyline_stroke_hit(
    point: [f32; 2],
    vertices: &[[f32; 2]],
    closed: bool,
    tolerance: f32,
) -> bool {
    if vertices.len() < 2 {
        return false;
    }
    let segment_count = if closed {
        vertices.len()
    } else {
        vertices.len() - 1
    };
    (0..segment_count).any(|index| {
        point_segment_distance(
            point,
            vertices[index],
            vertices[(index + 1) % vertices.len()],
        ) <= tolerance
    })
}

fn point_segment_distance(point: [f32; 2], start: [f32; 2], end: [f32; 2]) -> f32 {
    let dx = end[0] - start[0];
    let dy = end[1] - start[1];
    let length_squared = dx * dx + dy * dy;
    if length_squared <= f32::EPSILON {
        return ((point[0] - start[0]).powi(2) + (point[1] - start[1]).powi(2)).sqrt();
    }
    let t = (((point[0] - start[0]) * dx + (point[1] - start[1]) * dy) / length_squared)
        .clamp(0.0, 1.0);
    let nearest = [start[0] + dx * t, start[1] + dy * t];
    ((point[0] - nearest[0]).powi(2) + (point[1] - nearest[1]).powi(2)).sqrt()
}

pub(crate) fn rotate_around(point: (f32, f32), center: (f32, f32), angle: f32) -> (f32, f32) {
    let dx = point.0 - center.0;
    let dy = point.1 - center.1;
    (
        center.0 + dx * angle.cos() - dy * angle.sin(),
        center.1 + dx * angle.sin() + dy * angle.cos(),
    )
}

pub(crate) fn node_transform(node: &Node) -> [f32; 4] {
    [
        node.rotation.to_radians(),
        if node.flip_x { -1.0 } else { 1.0 },
        if node.flip_y { -1.0 } else { 1.0 },
        0.0,
    ]
}
