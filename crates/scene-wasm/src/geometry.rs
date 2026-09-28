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
