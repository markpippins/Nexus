use crate::runtime::rehydrate::snapshot::ReplaySnapshot;
use crate::runtime::rehydrate::registry::ViewRegistry;
use crate::runtime::rehydrate::view::View;

pub struct Reader {
    snap: Box<dyn ReplaySnapshot>,
    reg: &'static ViewRegistry,
}

impl Reader {
    pub fn new(snap: Box<dyn ReplaySnapshot>, reg: &'static ViewRegistry) -> Self {
        Reader { snap, reg }
    }

    pub fn scan(&self, prefix: &[u8]) -> Vec<Box<dyn View>> {
        let mut result: Vec<Box<dyn View>> = Vec::new();
        for (k, v) in self.snap.scan(prefix) {
            if let Some(view) = self.reg.decode(&k, &v) {
                result.push(view);
            }
        }
        result
    }
}
