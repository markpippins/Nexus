package com.angrysurfer.helidon.nexus.user.service;

import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;
import java.util.logging.Level;
import java.util.logging.Logger;

import org.eclipse.microprofile.config.inject.ConfigProperty;

import io.helidon.microprofile.cdi.RuntimeStart;
import jakarta.annotation.PreDestroy;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.enterprise.event.Observes;
import jakarta.inject.Inject;
import jakarta.ws.rs.client.Client;
import jakarta.ws.rs.client.ClientBuilder;
import jakarta.ws.rs.client.Entity;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;

/**
 * Service that registers and maintains heartbeat with the Spring
 * service-registry
 * registry.
 * Uses Helidon's @RuntimeStart event for eager initialization (similar to
 * Quarkus StartupEvent).
 */
@ApplicationScoped
public class RegistryClientService {

    private static final Logger LOGGER = Logger.getLogger(RegistryClientService.class.getName());

    @Inject
    @ConfigProperty(name = "service.registry.url", defaultValue = "http://localhost:8085")
    String hostServerUrl;

    @Inject
    @ConfigProperty(name = "service.name", defaultValue = "user-access-service")
    String serviceName;

    @Inject
    @ConfigProperty(name = "service.host", defaultValue = "localhost")
    String serviceHost;

    @Inject
    @ConfigProperty(name = "server.port", defaultValue = "9093")
    int servicePort;

    @Inject
    @ConfigProperty(name = "registration.enabled", defaultValue = "true")
    boolean registrationEnabled;

    @Inject
    @ConfigProperty(name = "heartbeat.interval.seconds", defaultValue = "30")
    int heartbeatInterval;

    private Client httpClient;
    private ScheduledExecutorService scheduler;

    /**
     * Called on application startup via Helidon's RuntimeStart event.
     * This ensures eager initialization, unlike @PostConstruct which is lazy
     * for @ApplicationScoped beans.
     */
    void onStart(@Observes @RuntimeStart Object event) {
        if (!registrationEnabled) {
            LOGGER.info("Service-Registry registration is disabled");
            return;
        }

        LOGGER.info("Starting service-registry registration service");

        httpClient = ClientBuilder.newClient();

        // Initial registration
        registerService();

        // Schedule periodic heartbeats
        scheduler = Executors.newSingleThreadScheduledExecutor();

        // Send first heartbeat after 2 seconds
        scheduler.schedule(this::sendHeartbeat, 2, TimeUnit.SECONDS);

        // Then send heartbeat at fixed interval
        scheduler.scheduleAtFixedRate(
                this::sendHeartbeat,
                heartbeatInterval,
                heartbeatInterval,
                TimeUnit.SECONDS);

        LOGGER.info("Registry client initialized. Service: " + serviceName +
                ", Heartbeats every " + heartbeatInterval + " seconds to " + hostServerUrl);
    }

    @PreDestroy
    public void shutdown() {
        if (scheduler != null && !scheduler.isShutdown()) {
            scheduler.shutdown();
            try {
                if (!scheduler.awaitTermination(5, TimeUnit.SECONDS)) {
                    scheduler.shutdownNow();
                }
            } catch (InterruptedException e) {
                scheduler.shutdownNow();
                Thread.currentThread().interrupt();
            }
        }
        if (httpClient != null) {
            httpClient.close();
        }
        LOGGER.info("Registry client shut down");
    }

    /**
     * Register the service with the service-registry registry
     */
    private void registerService() {
        String endpoint = "http://" + serviceHost + ":" + servicePort;
        String healthCheckUrl = endpoint + "/health";

        String registrationJson = String.format(
                "{\"serviceName\":\"%s\",\"endpoint\":\"%s\",\"healthCheck\":\"%s\"," +
                        "\"framework\":\"Helidon\",\"version\":\"4.0.0\",\"port\":%d," +
                        "\"operations\":[\"getUserById\",\"createUser\",\"updateUser\",\"deleteUser\"]}",
                serviceName, endpoint, healthCheckUrl, servicePort);

        try {
            Response response = httpClient.target(hostServerUrl + "/api/v1/registry/register")
                    .request(MediaType.APPLICATION_JSON)
                    .post(Entity.json(registrationJson));

            if (response.getStatus() >= 200 && response.getStatus() < 300) {
                LOGGER.info("Successfully registered with service-registry: " + serviceName);
            } else {
                LOGGER.warning("Failed to register with service-registry. Status: " + response.getStatus());
            }
            response.close();
        } catch (Exception e) {
            LOGGER.log(Level.WARNING, "Failed to register with service-registry: " + e.getMessage(), e);
        }
    }

    /**
     * Send heartbeat to maintain active status in Redis cache
     */
    private void sendHeartbeat() {
        try {
            Response response = httpClient.target(hostServerUrl + "/api/v1/registry/heartbeat/" + serviceName)
                    .request(MediaType.APPLICATION_JSON)
                    .post(Entity.json("{}"));

            if (response.getStatus() >= 200 && response.getStatus() < 300) {
                LOGGER.fine("Heartbeat sent successfully for " + serviceName);
            } else {
                LOGGER.warning("Heartbeat failed. Status: " + response.getStatus());
            }
            response.close();
        } catch (Exception e) {
            LOGGER.log(Level.WARNING, "Failed to send heartbeat: " + e.getMessage(), e);
        }
    }
}
