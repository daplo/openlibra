pub(crate) fn parse_hex_color(value: &str) -> Option<[f32; 4]> {
    let normalized = normalize_hex_color(value)?;
    let hex = normalized.strip_prefix('#')?;
    if hex.len() != 6 || !hex.as_bytes().iter().all(u8::is_ascii_hexdigit) {
        return None;
    }
    let red = u8::from_str_radix(&hex[0..2], 16).ok()?;
    let green = u8::from_str_radix(&hex[2..4], 16).ok()?;
    let blue = u8::from_str_radix(&hex[4..6], 16).ok()?;
    Some([
        red as f32 / 255.0,
        green as f32 / 255.0,
        blue as f32 / 255.0,
        1.0,
    ])
}

pub(crate) fn normalize_hex_color(value: &str) -> Option<String> {
    let hex = value.trim().strip_prefix('#').unwrap_or(value.trim());
    if hex.len() != 6 || !hex.as_bytes().iter().all(u8::is_ascii_hexdigit) {
        return None;
    }
    Some(format!("#{}", hex.to_ascii_uppercase()))
}
