use crate::runtime::rehydrate::view::View;

pub trait Decoder {
    fn decode(&self, key: &[u8], value: &[u8]) -> Option<Box<dyn View>>;
}
