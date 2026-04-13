package com.promptarchitect.model;

import com.fasterxml.jackson.annotation.JsonInclude;

import java.util.ArrayList;
import java.util.List;

@JsonInclude(JsonInclude.Include.NON_NULL)
public class Generate {
    private List<String> artifacts = new ArrayList<>();
    private boolean explanation = true;

    public Generate() {
        artifacts.add("Swing Components");
        artifacts.add("Model Classes");
        artifacts.add("JSON Schema");
    }

    public List<String> getArtifacts() { return artifacts; }
    public void setArtifacts(List<String> artifacts) { this.artifacts = artifacts; }

    public boolean isExplanation() { return explanation; }
    public void setExplanation(boolean explanation) { this.explanation = explanation; }
}
