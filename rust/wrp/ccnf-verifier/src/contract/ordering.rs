// Deterministic key ordering: lexicographic bytewise UTF-8.
// Rule 1 from SERIALIZATION_CONTRACT.md.

use std::cmp::Ordering;

pub fn sort_keys(keys: &mut Vec<String>) {
    keys.sort_by(|a, b| bytewise_utf8_cmp(a, b));
}

fn bytewise_utf8_cmp(a: &str, b: &str) -> Ordering {
    a.as_bytes().cmp(b.as_bytes())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn bytewise_ordering() {
        let mut keys = vec!["b".into(), "a".into(), "c".into()];
        sort_keys(&mut keys);
        assert_eq!(keys, vec!["a", "b", "c"]);
    }

    #[test]
    fn bytewise_utf8_preserves_case() {
        let mut keys = vec!["B".into(), "a".into()];
        sort_keys(&mut keys);
        // U+0042 'B' < U+0061 'a' in bytewise
        assert_eq!(keys, vec!["B", "a"]);
    }
}
