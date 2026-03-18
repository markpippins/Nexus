package com.angrysurfer.quarkus.nexus.broker.service;

import io.quarkus.runtime.StartupEvent;
import io.quarkus.runtime.ShutdownEvent;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.enterprise.event.Observes;
import jakarta.ws.rs.client.Client;
import jakarta.ws.rs.client.ClientBuilder;
import jakarta.ws.rs.client.Entity;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;
import org.eclipse.microprofile.config.inject.ConfigProperty;
import org.jboss.logging.Logger;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;

/**
 * Service that registers the Quarkus broker-gateway with the service-registry
 * on startup and sends periodic heartbeats.
 *
 * This demonstrates polyglot service registration - a Quarkus service
 * registering with a Spring Boot service-registry.
 */
@ApplicationScoped
public class ServiceRegistryRegistrationService {

    private static final Logger LOG = Logger.getLogger(ServiceRegistryRegistrationService.class);

    @ConfigProperty(name = "service.registry.url", defaultValue = "http://localhost:8085")
    String hostServerUrl;

    @ConfigProperty(name = "quarkus.http.port", defaultValue = "8090")
    int port;

    @ConfigProperty(name = "quarkus.application.name", defaultValue = "quarkus-broker-gateway")
    String serviceName;

    @ConfigProperty(name = "service.host", defaultValue = "localhost")
    String serviceHost;

    @ConfigProperty(name = "registration.enabled", defaultValue = "true")
    boolean registrationEnabled;

    @ConfigProperty(name = "heartbeat.interval.seconds", defaultValue = "30")
    int heartbeatInterval;

    private ScheduledExecutorService scheduler;
    private Client client;

    /**
     * Register with service-registry on application startup
     */
    void onStart(@Observes StartupEvent ev) {
        if (!registrationEnabled) {
            LOG.info("Service-Registry registration is disabled");
            return;
        }

        LOG.info("Starting service-registry registration service");

        client = ClientBuilder.newClient();

        // Initial registration
        registerService();

        // Schedule periodic heartbeats
        scheduler = Executors.newScheduledThreadPool(1);
        scheduler.scheduleAtFixedRate(
                this::sendHeartbeat,
                heartbeatInterval,
                heartbeatInterval,
                TimeUnit.SECONDS);

        LOG.info("Service-Registry registration service started. Heartbeat interval: " + heartbeatInterval + "s");
    }

    /**
     * Cleanup on application shutdown
     */
    void onStop(@Observes ShutdownEvent ev) {
        if (scheduler != null) {
            scheduler.shutdown();
        }
        if (client != null) {
            client.close();
        }
        LOG.info("Service-Registry registration service stopped");
    }

    /**
     * Register this Quarkus service with the service-registry
     */
    private void registerService() {
        Map<String, Object> registration = new HashMap<>();
        registration.put("serviceName", serviceName);
        registration.put("operations", List.of(
                "submitRequest",
                "routeRequest",
                "healthCheck"));
        registration.put("endpoint", String.format("http://%s:%d", serviceHost, port));
        registration.put("healthCheck", String.format("http://%s:%d/api/health", serviceHost, port));
        registration.put("framework", "Quarkus");
        registration.put("version", "3.15.1");
        registration.put("port", port);

        Map<String, Object> metadata = new HashMap<>();
        metadata.put("type", "broker-gateway");
        metadata.put("language", "Java");
        metadata.put("runtime", "Quarkus");
        metadata.put("native-capable", true);
        registration.put("metadata", metadata);

        try {
            Response response = client
                    .target(hostServerUrl)
                    .path("/api/registry/register")
                    .request(MediaType.APPLICATION_JSON)
                    .post(Entity.json(registration));

            if (response.getStatus() == 200) {
                LOG.info("Successfully registered with service-registry at " + hostServerUrl);
                LOG.info("Service: " + serviceName + " on port " + port);
            } else {
                LOG.warn("Failed to register with service-registry. Status: " + response.getStatus());
            }

            response.close();
        } catch (Exception e) {
            LOG.error("Error registering with service-registry: " + e.getMessage());
            // Don't fail startup if registration fails
        }
    }

    /**
     * Send heartbeat to service-registry to maintain registration
     */
    private void sendHeartbeat() {
        try {
            Response response = client
                    .target(hostServerUrl)
                    .path("/api/registry/heartbeat/" + serviceName)
                    .request(MediaType.APPLICATION_JSON)
                    .post(Entity.json("{}"));

            if (response.getStatus() == 200) {
                LOG.debug("Heartbeat sent successfully");
            } else {
                LOG.warn("Heartbeat failed. Status: " + response.getStatus());
            }

            response.close();
        } catch (Exception e) {
            LOG.error("Error sending heartbeat: " + e.getMessage());
        }
    }
}
