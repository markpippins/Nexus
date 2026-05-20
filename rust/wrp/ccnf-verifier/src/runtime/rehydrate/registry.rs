use crate::runtime::rehydrate::decode::Decoder;
use crate::runtime::rehydrate::view::View;

pub struct Route {
    pub prefix: &'static [u8],
    pub decoder: &'static dyn Decoder,
}

pub struct ViewRegistry {
    pub routes: &'static [Route],
}

impl ViewRegistry {
    pub fn decode(&self, key: &[u8], value: &[u8]) -> Option<Box<dyn View>> {
        for route in self.routes {
            if key.starts_with(route.prefix) {
                return route.decoder.decode(key, value);
            }
        }
        None
    }
}
