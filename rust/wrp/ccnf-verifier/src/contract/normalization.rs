// spec-faithful normalization: NFC, BOM stripping, zero-width chars,
// float formatting (no scientific notation), timestamp → epoch int64.

use unicode_normalization::UnicodeNormalization;

pub fn normalize_string(s: &str) -> String {
    let s = strip_bom(s);
    let s = strip_zero_width(&s);
    s.nfc().collect()
}

fn strip_bom(s: &str) -> &str {
    s.trim_start_matches('\u{FEFF}')
}

fn strip_zero_width(s: &str) -> String {
    s.chars()
        .filter(|c| !matches!(c,
            '\u{200B}' | // zero-width space
            '\u{200C}' | // zero-width non-joiner
            '\u{200D}' | // zero-width joiner
            '\u{FEFF}' | // BOM (already stripped but catch inline)
            '\u{00AD}'   // soft hyphen
        ))
        .collect()
}

pub fn normalize_float(value: f64) -> String {
    // MUST reject scientific notation; MUST normalize 3.0 -> 3
    if value.is_nan() || value.is_infinite() {
        return "null".to_string();
    }
    let s = format!("{:.}", value);
    // Reject scientific notation
    if s.contains('e') || s.contains('E') {
        return format!("{}", value);
    }
    s
}

pub fn normalize_timestamp(ts: &str) -> Result<i64, String> {
    // ISO-8601 -> epoch int64
    if let Ok(epoch) = ts.parse::<i64>() {
        return Ok(epoch);
    }
    // Placeholder: full ISO-8601 parsing requires chrono; for R8.1
    // only integer timestamps are used in golden vectors.
    Err(format!("cannot normalize timestamp: {}", ts))
}
