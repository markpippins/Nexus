package com.promptarchitect.model;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.annotation.JsonProperty;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@JsonInclude(JsonInclude.Include.NON_NULL)
public class PromptSpecification {

    private Context context;
    private Requirements requirements;
    @JsonProperty("ui_spec")
    private UiSpec uiSpec;
    @JsonProperty("data_spec")
    private DataSpec dataSpec;
    private Behavior behavior;
    private Testing testing;
    private Contracts contracts;
    private Generate generate;

    public PromptSpecification() {
        // Default initialization
        this.context = new Context();
        this.requirements = new Requirements();
        this.uiSpec = new UiSpec();
        this.dataSpec = new DataSpec();
        this.behavior = new Behavior();
        this.testing = new Testing();
        this.contracts = new Contracts();
        this.generate = new Generate();
    }

    // Getters and Setters
    public Context getContext() { return context; }
    public void setContext(Context context) { this.context = context; }

    public Requirements getRequirements() { return requirements; }
    public void setRequirements(Requirements requirements) { this.requirements = requirements; }

    public UiSpec getUiSpec() { return uiSpec; }
    public void setUiSpec(UiSpec uiSpec) { this.uiSpec = uiSpec; }

    public DataSpec getDataSpec() { return dataSpec; }
    public void setDataSpec(DataSpec dataSpec) { this.dataSpec = dataSpec; }

    public Behavior getBehavior() { return behavior; }
    public void setBehavior(Behavior behavior) { this.behavior = behavior; }

    public Testing getTesting() { return testing; }
    public void setTesting(Testing testing) { this.testing = testing; }

    public Contracts getContracts() { return contracts; }
    public void setContracts(Contracts contracts) { this.contracts = contracts; }

    public Generate getGenerate() { return generate; }
    public void setGenerate(Generate generate) { this.generate = generate; }
}
