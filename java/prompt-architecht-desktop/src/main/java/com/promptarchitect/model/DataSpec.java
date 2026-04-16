package com.promptarchitect.model;

import com.fasterxml.jackson.annotation.JsonInclude;

import java.util.LinkedHashMap;
import java.util.Map;

@JsonInclude(JsonInclude.Include.NON_NULL)
public class DataSpec {
    private Map<String, Object> model = new LinkedHashMap<>();
    private Storage storage = new Storage();

    public DataSpec() {}

    public Map<String, Object> getModel() { return model; }
    public void setModel(Map<String, Object> model) { this.model = model; }

    public Storage getStorage() { return storage; }
    public void setStorage(Storage storage) { this.storage = storage; }
}
