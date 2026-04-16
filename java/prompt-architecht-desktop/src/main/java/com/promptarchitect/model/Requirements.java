package com.promptarchitect.model;

import com.fasterxml.jackson.annotation.JsonInclude;

import java.util.ArrayList;
import java.util.List;

@JsonInclude(JsonInclude.Include.NON_NULL)
public class Requirements {
    private List<String> use = new ArrayList<>();
    private List<String> ensure = new ArrayList<>();
    private List<String> separate = new ArrayList<>();

    public Requirements() {
        use.add("Java 17+");
        use.add("Java Swing");
        use.add("Jackson JSON");
        use.add("Maven");
        
        ensure.add("Real-time synchronization between form inputs and JSON preview");
        ensure.add("Collapsible and toggleable sections for granular control");
        ensure.add("Clean, professional aesthetic with modern UI patterns");
        
        separate.add("Model classes from UI components");
        separate.add("Business logic from presentation layer");
        separate.add("Constants and initial configurations");
    }

    public List<String> getUse() { return use; }
    public void setUse(List<String> use) { this.use = use; }

    public List<String> getEnsure() { return ensure; }
    public void setEnsure(List<String> ensure) { this.ensure = ensure; }

    public List<String> getSeparate() { return separate; }
    public void setSeparate(List<String> separate) { this.separate = separate; }
}
