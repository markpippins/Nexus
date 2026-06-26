package com.aibizarchitect.nexus.v1.spring.topology.entity;

import jakarta.persistence.*;

@Entity
@Table(name = "cli_tools")
public class CliTool {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private String name;

    @Column(name = "tool_path")
    private String toolPath;

    @Column(length = 1000)
    private String description;

    private String invocation;

    private String language;

    private String category;

    private String startup;

    @Column(name = "startup_script")
    private String startupScript;

    @Column(name = "build_command")
    private String buildCommand;

    private String health;

    @Column(name = "sysuser")
    private String sysUser;

    @Column(name = "syspass")
    private String sysPass;

    @Column(length = 1000)
    private String notes;

    @Column(name = "is_internal")
    private Boolean isInternal = true;

    @Column(name = "active_flag")
    private Boolean activeFlag = true;

    public CliTool() {
    }

    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
    }

    public String getToolPath() {
        return toolPath;
    }

    public void setToolPath(String toolPath) {
        this.toolPath = toolPath;
    }

    public String getDescription() {
        return description;
    }

    public void setDescription(String description) {
        this.description = description;
    }

    public String getInvocation() {
        return invocation;
    }

    public void setInvocation(String invocation) {
        this.invocation = invocation;
    }

    public String getLanguage() {
        return language;
    }

    public void setLanguage(String language) {
        this.language = language;
    }

    public String getCategory() {
        return category;
    }

    public void setCategory(String category) {
        this.category = category;
    }

    public String getStartup() {
        return startup;
    }

    public void setStartup(String startup) {
        this.startup = startup;
    }

    public String getStartupScript() {
        return startupScript;
    }

    public void setStartupScript(String startupScript) {
        this.startupScript = startupScript;
    }

    public String getBuildCommand() {
        return buildCommand;
    }

    public void setBuildCommand(String buildCommand) {
        this.buildCommand = buildCommand;
    }

    public String getHealth() {
        return health;
    }

    public void setHealth(String health) {
        this.health = health;
    }

    public String getSysUser() {
        return sysUser;
    }

    public void setSysUser(String sysUser) {
        this.sysUser = sysUser;
    }

    public String getSysPass() {
        return sysPass;
    }

    public void setSysPass(String sysPass) {
        this.sysPass = sysPass;
    }

    public String getNotes() {
        return notes;
    }

    public void setNotes(String notes) {
        this.notes = notes;
    }

    public Boolean getIsInternal() {
        return isInternal;
    }

    public void setIsInternal(Boolean isInternal) {
        this.isInternal = isInternal;
    }

    public Boolean getActiveFlag() {
        return activeFlag;
    }

    public void setActiveFlag(Boolean activeFlag) {
        this.activeFlag = activeFlag;
    }
}
