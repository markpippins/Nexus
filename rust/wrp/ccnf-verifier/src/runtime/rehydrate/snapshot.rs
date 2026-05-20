pub trait ReplaySnapshot {
    fn get(&self, key: &[u8]) -> Option<Vec<u8>>;
    fn scan(&self, prefix: &[u8]) -> Box<dyn Iterator<Item = (Vec<u8>, Vec<u8>)>>;
    fn height(&self) -> u64;
}
