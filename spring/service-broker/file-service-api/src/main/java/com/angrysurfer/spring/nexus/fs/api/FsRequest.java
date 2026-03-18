package com.angrysurfer.spring.nexus.fs.api;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Objects;

import lombok.AllArgsConstructor;
import lombok.NoArgsConstructor;

@NoArgsConstructor
@AllArgsConstructor
public class FsRequest {

    private String alias;
    private List<String> path;
    private String toAlias;
    private List<String> toPath;
    private String operation;
    private String filename;
    private String newName;
    private List<Map<String, Object>> items;

    private List<String> getUserPath(String alias, List<String> path) {
        var userPath = new ArrayList<String>();
        userPath.add("users");
        userPath.add(alias);
        if (Objects.nonNull(path))
            userPath.addAll(path);
        return userPath;        
    }


    public FsRequest(String alias, List<String> path, String string) {
        this.alias = alias;
        this.path = getUserPath(alias, path);
        this.operation = string;
    }

    public String getAlias() {
        return alias;
    }

    public void setAlias(String alias) {
        this.alias = alias;
    }

    public List<String> getPath() {
        return path;
    }

    public void setPath(List<String> path) {
        this.path = path;
    }

    public String getOperation() {
        return operation;
    }

    public void setOperation(String operation) {
        this.operation = operation;
    }

    public String getFilename() {
        return filename;
    }

    public void setFilename(String filename) {
        this.filename = filename;
    }

    public String getNewName() {
        return newName;
    }

    public void setNewName(String newName) {
        this.newName = newName;
    }

    public String getToAlias() {
        return toAlias;
    }

    public void setToAlias(String toAlias) {
        this.toAlias = toAlias;
    }

    public List<String> getToPath() {
        return toPath;
    }

    public void setToPath(List<String> toPath) {
        this.toPath = toPath;
    }

    public List<Map<String, Object>> getItems() {
        return items;
    }

    public void setItems(List<Map<String, Object>> items) {
        this.items = items;
    }

}
