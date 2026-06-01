package com.aibizarchitect.nexus.v1.spring.topology.entity;

import jakarta.persistence.*;

@Entity
@Table(name = "broker_profiles")
public class BrokerProfile {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "profile_id", nullable = false, unique = true)
    private String profileId;

    @Column(nullable = false)
    private String name;

    @Column(name = "broker_url")
    private String brokerUrl;

    @Column(name = "image_url")
    private String imageUrl;

    @Column(name = "auto_connect")
    private Boolean autoConnect = false;

    @Column(name = "health_check_delay_minutes")
    private Integer healthCheckDelayMinutes;

    public BrokerProfile() {
    }

    public BrokerProfile(Long id, String profileId, String name, String brokerUrl, String imageUrl,
                         Boolean autoConnect, Integer healthCheckDelayMinutes) {
        this.id = id;
        this.profileId = profileId;
        this.name = name;
        this.brokerUrl = brokerUrl;
        this.imageUrl = imageUrl;
        this.autoConnect = autoConnect;
        this.healthCheckDelayMinutes = healthCheckDelayMinutes;
    }

    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public String getProfileId() {
        return profileId;
    }

    public void setProfileId(String profileId) {
        this.profileId = profileId;
    }

    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
    }

    public String getBrokerUrl() {
        return brokerUrl;
    }

    public void setBrokerUrl(String brokerUrl) {
        this.brokerUrl = brokerUrl;
    }

    public String getImageUrl() {
        return imageUrl;
    }

    public void setImageUrl(String imageUrl) {
        this.imageUrl = imageUrl;
    }

    public Boolean getAutoConnect() {
        return autoConnect;
    }

    public void setAutoConnect(Boolean autoConnect) {
        this.autoConnect = autoConnect;
    }

    public Integer getHealthCheckDelayMinutes() {
        return healthCheckDelayMinutes;
    }

    public void setHealthCheckDelayMinutes(Integer healthCheckDelayMinutes) {
        this.healthCheckDelayMinutes = healthCheckDelayMinutes;
    }
}
