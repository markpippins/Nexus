package com.promptarchitect.model;

import com.fasterxml.jackson.annotation.JsonInclude;

@JsonInclude(JsonInclude.Include.NON_NULL)
public class Contracts {
    private String typespec;

    public Contracts() {
        this.typespec = null;
    }

    public String getTypespec() { return typespec; }
    public void setTypespec(String typespec) { this.typespec = typespec; }
}
