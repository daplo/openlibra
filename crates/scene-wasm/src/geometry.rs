use crate::Node;

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

// Apply the change between two container frames to a world-space descendant.
// Keeping resolved geometry in the document preserves existing file coordinates
// and lets hit testing, editing and all renderers consume the same transform.
pub(crate) fn transform_between(node: &mut Node, from: &Node, to: &Node) {
    let old_center = (from.x + from.width / 2.0, from.y + from.height / 2.0);
    let new_center = (to.x + to.width / 2.0, to.y + to.height / 2.0);
    let reflect_x = from.flip_x != to.flip_x;
    let reflect_y = from.flip_y != to.flip_y;
    let linear = |point: (f32, f32)| {
        let local = rotate_around(point, (0.0, 0.0), -from.rotation.to_radians());
        rotate_around(
            (
                if reflect_x { -local.0 } else { local.0 },
                if reflect_y { -local.1 } else { local.1 },
            ),
            (0.0, 0.0),
            to.rotation.to_radians(),
        )
    };
    let center = linear((
        node.x + node.width / 2.0 - old_center.0,
        node.y + node.height / 2.0 - old_center.1,
    ));
    node.x = new_center.0 + center.0 - node.width / 2.0;
    node.y = new_center.1 + center.1 - node.height / 2.0;
    let direction = linear((
        node.rotation.to_radians().cos(),
        node.rotation.to_radians().sin(),
    ));
    // Keep both flip controls stable while decomposing the resulting orthogonal matrix.
    let sign = if reflect_x { -1.0 } else { 1.0 };
    node.rotation = (direction.1 * sign)
        .atan2(direction.0 * sign)
        .to_degrees()
        .rem_euclid(360.0);
    node.flip_x ^= reflect_x;
    node.flip_y ^= reflect_y;
}

pub(crate) fn point_in_frame(node: &Node, x: f32, y: f32) -> bool {
    let center = (node.x + node.width / 2.0, node.y + node.height / 2.0);
    let point = rotate_around((x, y), center, -node.rotation.to_radians());
    let mut lx = point.0 - node.x;
    let mut ly = point.1 - node.y;
    if node.flip_x {
        lx = node.width - lx;
    }
    if node.flip_y {
        ly = node.height - ly;
    }
    if lx < 0.0 || ly < 0.0 || lx > node.width || ly > node.height {
        return false;
    }
    for (index, (radius, cx, cy)) in [
        (
            node.corner_radii[0],
            node.corner_radii[0],
            node.corner_radii[0],
        ),
        (
            node.corner_radii[1],
            node.width - node.corner_radii[1],
            node.corner_radii[1],
        ),
        (
            node.corner_radii[2],
            node.width - node.corner_radii[2],
            node.height - node.corner_radii[2],
        ),
        (
            node.corner_radii[3],
            node.corner_radii[3],
            node.height - node.corner_radii[3],
        ),
    ]
    .into_iter()
    .enumerate()
    {
        let in_corner = match index {
            0 => lx < cx && ly < cy,
            1 => lx > cx && ly < cy,
            2 => lx > cx && ly > cy,
            _ => lx < cx && ly > cy,
        };
        if in_corner && (lx - cx).powi(2) + (ly - cy).powi(2) > radius.powi(2) {
            return false;
        }
    }
    true
}

pub(crate) fn point_in_mask(node: &Node, x: f32, y: f32) -> bool {
    use crate::{FillRule, VectorGeometry};
    if node.kind == crate::NodeKind::Rectangle {
        return point_in_frame(node, x, y);
    }
    let center = (node.x + node.width / 2.0, node.y + node.height / 2.0);
    let p = rotate_around((x, y), center, -node.rotation.to_radians());
    let mut x = (p.0 - node.x) / node.width;
    let mut y = (p.1 - node.y) / node.height;
    if node.flip_x {
        x = 1.0 - x;
    }
    if node.flip_y {
        y = 1.0 - y;
    }
    let Some(vector) = &node.vector else {
        return false;
    };
    if matches!(vector.geometry, VectorGeometry::Ellipse) {
        return (x - 0.5).powi(2) + (y - 0.5).powi(2) <= 0.25;
    }
    let contours = match &vector.geometry {
        VectorGeometry::Path { contours } => contours.clone(),
        geometry => crate::edit::contours_for_geometry(geometry).unwrap_or_default(),
    };
    let mut winding = 0_i32;
    for contour in contours {
        for i in 0..contour.points.len() {
            let a = &contour.points[i];
            let b = &contour.points[(i + 1) % contour.points.len()];
            let h1 = a.handle_out.unwrap_or(a.position);
            let h2 = b.handle_in.unwrap_or(b.position);
            let steps = if a.handle_out.is_some() || b.handle_in.is_some() {
                64
            } else {
                1
            };
            let mut previous = a.position;
            for step in 1..=steps {
                let t = step as f32 / steps as f32;
                let u = 1.0 - t;
                let next = [
                    u * u * u * a.position[0]
                        + 3.0 * u * u * t * h1[0]
                        + 3.0 * u * t * t * h2[0]
                        + t * t * t * b.position[0],
                    u * u * u * a.position[1]
                        + 3.0 * u * u * t * h1[1]
                        + 3.0 * u * t * t * h2[1]
                        + t * t * t * b.position[1],
                ];
                if (previous[1] <= y && next[1] > y) || (previous[1] > y && next[1] <= y) {
                    let cross = previous[0]
                        + (y - previous[1]) * (next[0] - previous[0]) / (next[1] - previous[1]);
                    if cross > x {
                        winding += if next[1] > previous[1] { 1 } else { -1 };
                    }
                }
                previous = next;
            }
        }
    }
    if vector.fill_rule == FillRule::Evenodd {
        winding.abs() % 2 == 1
    } else {
        winding != 0
    }
}
