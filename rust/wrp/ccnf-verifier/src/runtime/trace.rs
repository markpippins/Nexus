use std::sync::LazyLock;
use sha2::{Sha256, Digest};
use hex;

const HASH_HEX_LEN: usize = 64;
const RAW_HASH_LEN: usize = 32;

static TRACE_DOMAIN: LazyLock<Vec<u8>> = LazyLock::new(|| {
    let mut h = Sha256::new();
    h.update(b"ccnf-domain:trace:v1");
    h.finalize().to_vec()
});

#[derive(Debug, Clone)]
pub struct TraceBuilder {
    hashes: Vec<[u8; RAW_HASH_LEN]>,
}

impl TraceBuilder {
    pub fn new() -> Self {
        TraceBuilder {
            hashes: Vec::new(),
        }
    }

    pub fn append(&mut self, cer_hash_hex: &str) {
        if cer_hash_hex.len() != HASH_HEX_LEN {
            panic!("TraceBuilder: invalid CER hash length: {}", cer_hash_hex.len());
        }
        let raw = hex::decode(cer_hash_hex)
            .expect("TraceBuilder: invalid hex in CER hash");
        if raw.len() != RAW_HASH_LEN {
            panic!("TraceBuilder: invalid CER hash byte length: {}", raw.len());
        }
        let mut arr = [0u8; RAW_HASH_LEN];
        arr.copy_from_slice(&raw);
        self.hashes.push(arr);
    }

    pub fn root_hash(&self) -> String {
        let mut h = Sha256::new();
        h.update(&TRACE_DOMAIN[..]);

        let count = (self.hashes.len() as u64).to_be_bytes();
        h.update(&count);

        for raw in &self.hashes {
            h.update(raw);
        }

        hex::encode(h.finalize())
    }

    pub fn event_count(&self) -> u64 {
        self.hashes.len() as u64
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use sha2::{Sha256, Digest};

    fn valid_hash() -> String {
        "aa00000000000000000000000000000000000000000000000000000000000001".into()
    }

    #[test]
    fn test_new_empty() {
        let tb = TraceBuilder::new();
        assert_eq!(tb.event_count(), 0);
        assert_eq!(tb.root_hash().len(), 64);
    }

    #[test]
    fn test_append_single() {
        let mut tb = TraceBuilder::new();
        tb.append(&valid_hash());
        assert_eq!(tb.event_count(), 1);
        assert_eq!(tb.root_hash().len(), 64);

        let h1 = tb.root_hash();
        let h2 = tb.root_hash();
        assert_eq!(h1, h2);
    }

    #[test]
    fn test_append_multiple() {
        let mut tb = TraceBuilder::new();
        tb.append("a000000000000000000000000000000000000000000000000000000000000001");
        tb.append("a000000000000000000000000000000000000000000000000000000000000002");
        tb.append("a000000000000000000000000000000000000000000000000000000000000003");
        assert_eq!(tb.event_count(), 3);

        let mut tb_single = TraceBuilder::new();
        tb_single.append("a000000000000000000000000000000000000000000000000000000000000001");
        assert_ne!(tb.root_hash(), tb_single.root_hash());

        let mut tb_reorder = TraceBuilder::new();
        tb_reorder.append("a000000000000000000000000000000000000000000000000000000000000003");
        tb_reorder.append("a000000000000000000000000000000000000000000000000000000000000002");
        tb_reorder.append("a000000000000000000000000000000000000000000000000000000000000001");
        assert_ne!(tb.root_hash(), tb_reorder.root_hash());
    }

    #[test]
    fn test_determinism() {
        let hashes = vec![
            "b000000000000000000000000000000000000000000000000000000000000001",
            "b000000000000000000000000000000000000000000000000000000000000002",
        ];

        let mut first = TraceBuilder::new();
        first.append(hashes[0]);
        first.append(hashes[1]);
        let expected = first.root_hash();

        for _ in 0..5 {
            let mut tb = TraceBuilder::new();
            tb.append(hashes[0]);
            tb.append(hashes[1]);
            assert_eq!(tb.root_hash(), expected);
        }
    }

    #[test]
    fn test_domain_separation() {
        let mut h = Sha256::new();
        h.update(b"ccnf-domain:trace:v1");
        let domain = h.finalize();

        let mut h = Sha256::new();
        h.update(&domain);
        h.update(&2u64.to_be_bytes());

        let h1 = hex::decode("cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc").unwrap();
        let h2 = hex::decode("dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd").unwrap();
        h.update(&h1);
        h.update(&h2);
        let expected = hex::encode(h.finalize());

        let mut tb = TraceBuilder::new();
        tb.append("cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc");
        tb.append("dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd");

        assert_eq!(tb.root_hash(), expected);
    }

    #[test]
    fn test_different_from_plain_hash() {
        let mut tb = TraceBuilder::new();
        tb.append("eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee");
        tb.append("ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff");
        let trace_root = tb.root_hash();

        let mut h = Sha256::new();
        h.update(b"eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee");
        h.update(b"ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff");
        let plain = hex::encode(h.finalize());

        assert_ne!(trace_root, plain);
    }

    #[test]
    #[should_panic(expected = "invalid CER hash length")]
    fn test_append_panics_short() {
        let mut tb = TraceBuilder::new();
        tb.append("short");
    }

    #[test]
    #[should_panic(expected = "invalid hex")]
    fn test_append_panics_invalid_hex() {
        let mut tb = TraceBuilder::new();
        tb.append("zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz");
    }

    #[test]
    fn test_empty_traces_equal() {
        let tb1 = TraceBuilder::new();
        let tb2 = TraceBuilder::new();
        assert_eq!(tb1.root_hash(), tb2.root_hash());
    }

    #[test]
    fn test_trace_differs_from_cer_hash() {
        let cer_hash = "aa00000000000000000000000000000000000000000000000000000000000001";
        let mut tb = TraceBuilder::new();
        tb.append(cer_hash);
        assert_ne!(tb.root_hash(), cer_hash);
    }
}
