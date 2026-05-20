use std::collections::HashMap;
use crate::runtime::rehydrate::snapshot::ReplaySnapshot;
use crate::projection::projection::Projection;

#[derive(Debug, Clone, PartialEq)]
pub struct AccountBalance {
    pub id: String,
    pub balance: u64,
}

impl Projection for AccountBalance {
    fn kind(&self) -> &'static str {
        "account_balance"
    }
}

struct CacheEntry {
    balance: u64,
}

pub struct AccountProjection {
    cache: HashMap<String, CacheEntry>,
}

impl AccountProjection {
    pub fn build(snap: &dyn ReplaySnapshot) -> Self {
        let mut cache = HashMap::new();
        let mut iter = snap.scan(b"acct:");
        while let Some((k, v)) = iter.next() {
            let k_str = String::from_utf8_lossy(&k);
            let v_str = String::from_utf8_lossy(&v);
            if let Some(id) = k_str.strip_prefix("acct:") {
                if let Ok(balance) = v_str.parse::<u64>() {
                    cache.insert(id.to_string(), CacheEntry { balance });
                }
            }
        }
        AccountProjection { cache }
    }

    pub fn get_balance(&self, id: &str) -> Option<u64> {
        self.cache.get(id).map(|e| e.balance)
    }

    pub fn all_balances(&self) -> Vec<AccountBalance> {
        self.cache.iter().map(|(id, entry)| {
            AccountBalance {
                id: id.clone(),
                balance: entry.balance,
            }
        }).collect()
    }

    pub fn count(&self) -> usize {
        self.cache.len()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;

    struct TestSnapshot {
        data: HashMap<Vec<u8>, Vec<u8>>,
        height: u64,
    }

    impl ReplaySnapshot for TestSnapshot {
        fn get(&self, key: &[u8]) -> Option<Vec<u8>> {
            self.data.get(key).cloned()
        }
        fn scan(&self, prefix: &[u8]) -> Box<dyn Iterator<Item = (Vec<u8>, Vec<u8>)>> {
            let mut results = Vec::new();
            for (k, v) in &self.data {
                if k.starts_with(prefix) {
                    results.push((k.clone(), v.clone()));
                }
            }
            results.sort_by(|a, b| a.0.cmp(&b.0));
            Box::new(results.into_iter())
        }
        fn height(&self) -> u64 { self.height }
    }

    fn make_snapshot(pairs: Vec<(&str, &str)>, height: u64) -> TestSnapshot {
        let mut data = HashMap::new();
        for (k, v) in pairs {
            data.insert(k.as_bytes().to_vec(), v.as_bytes().to_vec());
        }
        TestSnapshot { data, height }
    }

    #[test]
    fn test_build_account_projection_round_trip() {
        let snap = make_snapshot(vec![
            ("acct:alice", "100"),
            ("acct:bob", "200"),
            ("acct:carol", "300"),
        ], 1);

        let proj = AccountProjection::build(&snap);

        assert_eq!(proj.count(), 3);
        assert_eq!(proj.get_balance("alice"), Some(100));
        assert_eq!(proj.get_balance("bob"), Some(200));

        let all = proj.all_balances();
        assert_eq!(all.len(), 3);
    }

    #[test]
    fn test_build_account_projection_empty() {
        let snap = make_snapshot(vec![], 0);
        let proj = AccountProjection::build(&snap);

        assert_eq!(proj.count(), 0);
        assert_eq!(proj.get_balance("nonexistent"), None);
    }

    #[test]
    fn test_build_account_projection_malformed_value() {
        let snap = make_snapshot(vec![
            ("acct:good", "50"),
            ("acct:bad", "not-a-number"),
            ("acct:good2", "75"),
        ], 1);

        let proj = AccountProjection::build(&snap);

        assert_eq!(proj.count(), 2);
        assert_eq!(proj.get_balance("good"), Some(50));
        assert_eq!(proj.get_balance("bad"), None);
    }

    #[test]
    fn test_build_account_projection_rebuild_determinism() {
        let snap = make_snapshot(vec![
            ("acct:alice", "100"),
            ("acct:bob", "200"),
        ], 1);

        let p1 = AccountProjection::build(&snap);
        let p2 = AccountProjection::build(&snap);

        assert_eq!(p1.count(), p2.count());
        assert_eq!(p1.get_balance("alice"), p2.get_balance("alice"));
    }
}
