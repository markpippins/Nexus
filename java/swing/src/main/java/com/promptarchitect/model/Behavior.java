package com.promptarchitect.model;

import java.util.ArrayList;
import java.util.List;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.annotation.JsonProperty;

@JsonInclude(JsonInclude.Include.NON_NULL)
public class Behavior {
    @JsonProperty("state_changes")
    private List<String> stateChanges = new ArrayList<>();
    private List<String> validation = new ArrayList<>();
    @JsonProperty("edge_cases")
    private List<String> edgeCases = new ArrayList<>();

    public Behavior() {
        stateChanges.add("Form input change updates the central state object");
        stateChanges.add("Section toggle checkbox sets the corresponding top-level key to null or default values");
        stateChanges.add("Copy button triggers clipboard write and temporary success state");

        validation.add("List inputs require non-empty strings to add items");

        edgeCases.add("Handling null sections in the UI to prevent rendering errors");
        edgeCases.add("Empty list states showing placeholders");
    }

    public List<String> getStateChanges() {
        return stateChanges;
    }

    public void setStateChanges(List<String> stateChanges) {
        this.stateChanges = stateChanges;
    }

    public List<String> getValidation() {
        return validation;
    }

    public void setValidation(List<String> validation) {
        this.validation = validation;
    }

    public List<String> getEdgeCases() {
        return edgeCases;
    }

    public void setEdgeCases(List<String> edgeCases) {
        this.edgeCases = edgeCases;
    }
}
