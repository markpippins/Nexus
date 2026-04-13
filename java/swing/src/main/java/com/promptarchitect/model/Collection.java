package com.promptarchitect.model;

import com.fasterxml.jackson.annotation.JsonInclude;

@JsonInclude(JsonInclude.Include.NON_NULL)
public class Collection {
    private String name;
    private String schema;

    public Collection() {}

    public Collection(String name, String schema) {
        this.name = name;
        this.schema = schema;
    }

    public String getName() { return name; }
    public void setName(String name) { this.name = name; }

    public String getSchema() { return schema; }
    public void setSchema(String schema) { this.schema = schema; }
}
