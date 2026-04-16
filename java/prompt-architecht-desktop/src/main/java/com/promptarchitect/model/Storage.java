package com.promptarchitect.model;

import com.fasterxml.jackson.annotation.JsonInclude;

import java.util.ArrayList;
import java.util.List;

@JsonInclude(JsonInclude.Include.NON_NULL)
public class Storage {
    private String type = "Local File System";
    private List<Collection> collections = new ArrayList<>();

    public Storage() {}

    public String getType() { return type; }
    public void setType(String type) { this.type = type; }

    public List<Collection> getCollections() { return collections; }
    public void setCollections(List<Collection> collections) { this.collections = collections; }
}
