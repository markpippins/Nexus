package com.promptarchitect.model;

import java.util.ArrayList;
import java.util.List;

import com.fasterxml.jackson.annotation.JsonInclude;

@JsonInclude(JsonInclude.Include.NON_NULL)
public class UiSpec {
    private List<UiElement> elements = new ArrayList<>();
    private String layout = "grid";
    private String theme = "light";

    public UiSpec() {
        elements.add(new UiElement("header", "Application Header", "app.title", null));
        elements.add(new UiElement("collapsible_section", "Project Context", "data.context", null));
        elements.add(new UiElement("collapsible_section", "Requirements", "data.requirements", null));
        elements.add(new UiElement("collapsible_section", "UI & Styling", "data.ui_spec", null));
        elements.add(new UiElement("collapsible_section", "Data & Backend", "data.data_spec", null));
        elements.add(new UiElement("collapsible_section", "Behavior & Logic", "data.behavior", null));
        elements.add(new UiElement("collapsible_section", "Testing & Quality", "data.testing", null));
        elements.add(new UiElement("collapsible_section", "Contracts", "data.contracts", null));
        elements.add(new UiElement("collapsible_section", "Output Configuration", "data.generate", null));
        elements.add(new UiElement("preview_panel", "Live Prompt Preview", "jsonOutput", null));
        elements.add(new UiElement("button", "Copy Prompt JSON", null, "handleCopy"));
    }

    public List<UiElement> getElements() {
        return elements;
    }

    public void setElements(List<UiElement> elements) {
        this.elements = elements;
    }

    public String getLayout() {
        return layout;
    }

    public void setLayout(String layout) {
        this.layout = layout;
    }

    public String getTheme() {
        return theme;
    }

    public void setTheme(String theme) {
        this.theme = theme;
    }
}
