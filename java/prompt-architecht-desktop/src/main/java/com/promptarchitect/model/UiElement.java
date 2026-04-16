package com.promptarchitect.model;

import com.fasterxml.jackson.annotation.JsonInclude;

@JsonInclude(JsonInclude.Include.NON_NULL)
public class UiElement {
    private String type;
    private String title;
    @com.fasterxml.jackson.annotation.JsonProperty("bind_to")
    private String bindTo;
    private String action;

    public UiElement() {}

    public UiElement(String type, String title, String bindTo, String action) {
        this.type = type;
        this.title = title;
        this.bindTo = bindTo;
        this.action = action;
    }

    public String getType() { return type; }
    public void setType(String type) { this.type = type; }

    public String getTitle() { return title; }
    public void setTitle(String title) { this.title = title; }

    public String getBindTo() { return bindTo; }
    public void setBindTo(String bindTo) { this.bindTo = bindTo; }

    public String getAction() { return action; }
    public void setAction(String action) { this.action = action; }
}
