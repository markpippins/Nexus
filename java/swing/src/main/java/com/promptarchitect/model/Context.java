package com.promptarchitect.model;

import com.fasterxml.jackson.annotation.JsonInclude;

import java.util.HashMap;
import java.util.Map;

@JsonInclude(JsonInclude.Include.NON_NULL)
public class Context {
    private String project = "Prompt Architect";
    private String description = "A swing application designed to help users build structured, high-fidelity JSON prompts for LLMs by defining system specifications through a modular interface.";
    @com.fasterxml.jackson.annotation.JsonProperty("agent_role")
    private String agentRole = "Senior Product Designer and Java Swing Architect";
    private Map<String, String> assume = new HashMap<>();

    public Context() {
        assume.put("OS", "any");
        assume.put("Browser", "modern");
        assume.put("Framework", "Java Swing");
    }

    public String getProject() { return project; }
    public void setProject(String project) { this.project = project; }

    public String getDescription() { return description; }
    public void setDescription(String description) { this.description = description; }

    public String getAgentRole() { return agentRole; }
    public void setAgentRole(String agentRole) { this.agentRole = agentRole; }

    public Map<String, String> getAssume() { return assume; }
    public void setAssume(Map<String, String> assume) { this.assume = assume; }
}
