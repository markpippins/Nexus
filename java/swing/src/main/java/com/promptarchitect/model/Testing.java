package com.promptarchitect.model;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.annotation.JsonProperty;

import java.util.ArrayList;
import java.util.List;

@JsonInclude(JsonInclude.Include.NON_NULL)
public class Testing {
    @JsonProperty("test_cases")
    private List<String> testCases = new ArrayList<>();
    @JsonProperty("error_handling")
    private List<String> errorHandling = new ArrayList<>();
    private List<String> performance = new ArrayList<>();

    public Testing() {
        testCases.add("Verify that disabling a section removes it from the JSON preview");
        testCases.add("Check that 'Copy' functionality works correctly");

        errorHandling.add("Graceful fallback for missing section data");
        errorHandling.add("Visual feedback for failed actions");

        performance.add("Efficient JSON stringification to prevent UI lag");
    }

    public List<String> getTestCases() { return testCases; }
    public void setTestCases(List<String> testCases) { this.testCases = testCases; }

    public List<String> getErrorHandling() { return errorHandling; }
    public void setErrorHandling(List<String> errorHandling) { this.errorHandling = errorHandling; }

    public List<String> getPerformance() { return performance; }
    public void setPerformance(List<String> performance) { this.performance = performance; }
}
