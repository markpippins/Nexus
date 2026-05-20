pub trait View {
    fn kind(&self) -> &'static str;
}

pub struct ExampleView {
    pub key: String,
    pub value: String,
}

impl View for ExampleView {
    fn kind(&self) -> &'static str {
        "example"
    }
}
