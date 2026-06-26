package com.aibizarchitect.nexus.v1.spring.topology.entity;

import jakarta.persistence.*;

@Entity
@Table(name = "servers")
public class Server {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, unique = true)
    private String hostname;

    @Column(name = "ip_address")
    private String ipAddress;

    private String os;

    private String status;

    @Column(name = "active_flag")
    private Boolean activeFlag = true;

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

    public Server() {
    }

    public Server(Long id, String hostname, String ipAddress, String os, String status, Boolean activeFlag) {
        this.id = id;
        this.hostname = hostname;
        this.ipAddress = ipAddress;
        this.os = os;
        this.status = status;
        this.activeFlag = activeFlag;
    }

    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public String getHostname() {
        return hostname;
    }

    public void setHostname(String hostname) {
        this.hostname = hostname;
    }

    public String getIpAddress() {
        return ipAddress;
    }

    public void setIpAddress(String ipAddress) {
        this.ipAddress = ipAddress;
    }

    public String getOs() {
        return os;
    }

    public void setOs(String os) {
        this.os = os;
    }

    public String getStatus() {
        return status;
    }

    public void setStatus(String status) {
        this.status = status;
    }

    public Boolean getActiveFlag() {
        return activeFlag;
    }

    public void setActiveFlag(Boolean activeFlag) {
        this.activeFlag = activeFlag;
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
}
