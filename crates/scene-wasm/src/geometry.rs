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
