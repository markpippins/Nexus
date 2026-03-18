package com.angrysurfer.helidon.nexus.registration;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;
import java.util.logging.Logger;

import org.eclipse.microprofile.config.inject.ConfigProperty;

import com.fasterxml.jackson.databind.ObjectMapper;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;

@ApplicationScoped
public class ServiceRegistryRegistrationService {

    private static final Logger logger = Logger.getLogger(ServiceRegistryRegistrationService.class.getName());

    @Inject
    @ConfigProperty(name = "service.registry.url", defaultValue = "http://localhost:8085")
    String hostServerUrl;

    @Inject
    @ConfigProperty(name = "server.port", defaultValue = "9093")
    int port;

    @Inject
    @ConfigProperty(name = "service.name", defaultValue = "helidon-user-access-service")
    String serviceName;

    @Inject
    @ConfigProperty(name = "service.host", defaultValue = "localhost")
    String serviceHost;

    @Inject
    @ConfigProperty(name = "registration.enabled", defaultValue = "true")
    boolean registrationEnabled;

    @Inject
    @ConfigProperty(name = "heartbeat.interval.seconds", defaultValue = "30")
    int heartbeatInterval;

    private final HttpClient httpClient;
    private final ObjectMapper objectMapper;
    private ScheduledExecutorService scheduler;

    public ServiceRegistryRegistrationService() {
        this.httpClient = HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(10))
                .build();
        this.objectMapper = new ObjectMapper();
    }

    /**
     * Register the service with the service-registry
     */
    public void registerService() {
        if (!registrationEnabled) {
            logger.info("Host server registration is disabled");
            return;
        }

        logger.info("Starting registration with host server: " + hostServerUrl);
        logger.info("Service details - Name: " + serviceName + ", Host: " + serviceHost + ", Port: " + port);

        // Create registration payload
        Map<String, Object> registration = new HashMap<>();
        registration.put("serviceName", serviceName);
        registration.put("operations", List.of(
                "validateUser",
                "getUserProfile",
                "authenticate",
                "authorize"));
        registration.put("endpoint", String.format("http://%s:%d", serviceHost, port));
        registration.put("healthCheck", String.format("http://%s:%d/health", serviceHost, port));
        registration.put("framework", "Helidon MP");
        registration.put("version", "4.3.2");
        registration.put("port", port);

        Map<String, Object> metadata = new HashMap<>();
        metadata.put("type", "user-access-service");
        metadata.put("language", "Java");
        metadata.put("runtime", "Helidon");
        metadata.put("native-capable", true);
        metadata.put("category", "authentication");
        metadata.put("capabilities", List.of("user-validation", "authentication", "authorization"));
        registration.put("metadata", metadata);

        // Start heartbeat scheduler regardless of initial registration success
        // This ensures the service keeps trying to register and stays visible to the
        // service-registry
        startHeartbeat();

        // Send registration request
        try {
            String jsonPayload = objectMapper.writeValueAsString(registration);
            logger.fine("Registration payload: " + jsonPayload);

            HttpRequest request = HttpRequest.newBuilder()
                    .uri(URI.create(hostServerUrl + "/api/registry/register"))
                    .header("Content-Type", "application/json")
                    .POST(HttpRequest.BodyPublishers.ofString(jsonPayload))
                    .timeout(Duration.ofSeconds(10))
                    .build();

            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());

            if (response.statusCode() == 200) {
                logger.info("Successfully registered with host server: " + serviceName);
                logger.info("Service endpoint: " + String.format("http://%s:%d", serviceHost, port));
            } else {
                logger.warning("Failed to register with host server. Status: " + response.statusCode() +
                        ", Response: " + response.body());
            }
        } catch (IOException | InterruptedException e) {
            logger.severe("Error registering with host server: " + e.getMessage());
            Thread.currentThread().interrupt();
        } catch (Exception e) {
            logger.severe("Error registering with host server: " + e.getMessage());
        }
    }

    /**
     * Send heartbeat to maintain registration
     */
    private void sendHeartbeat() {
        try {
            HttpRequest request = HttpRequest.newBuilder()
                    .uri(URI.create(hostServerUrl + "/api/registry/heartbeat/" + serviceName))
                    .header("Content-Type", "application/json")
                    .POST(HttpRequest.BodyPublishers.ofString("{}"))
                    .timeout(Duration.ofSeconds(10))
                    .build();

            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());

            if (response.statusCode() == 200) {
                logger.fine("Heartbeat sent successfully for: " + serviceName);
            } else if (response.statusCode() == 404) {
                logger.warning("Service " + serviceName
                        + " not found in registry. Will attempt re-registration on next heartbeat cycle.");
            } else {
                logger.warning("Failed to send heartbeat for " + serviceName + ". Status: " + response.statusCode() +
                        ", Response: " + response.body());
            }
        } catch (IOException | InterruptedException e) {
            logger.warning("Error sending heartbeat for " + serviceName + ": " + e.getMessage());
            Thread.currentThread().interrupt();
        } catch (Exception e) {
            logger.warning("Error sending heartbeat for " + serviceName + ": " + e.getMessage());
        }
    }

    /**
     * Start the heartbeat scheduler
     */
    private void startHeartbeat() {
        scheduler = Executors.newScheduledThreadPool(1);
        scheduler.scheduleAtFixedRate(
                this::sendHeartbeat,
                heartbeatInterval,
                heartbeatInterval,
                TimeUnit.SECONDS);
        logger.info("Heartbeat scheduler started for service: " + serviceName + " with interval: " + heartbeatInterval
                + " seconds");
    }

    /**
     * Cleanup resources on shutdown
     */
    public void cleanup() {
        logger.info("Cleaning up registration service for: " + serviceName);
        if (scheduler != null && !scheduler.isShutdown()) {
            logger.info("Shutting down heartbeat scheduler for: " + serviceName);
            scheduler.shutdown();
            try {
                if (!scheduler.awaitTermination(5, TimeUnit.SECONDS)) {
                    logger.info("Forcefully shutting down heartbeat scheduler for: " + serviceName);
                    scheduler.shutdownNow();
                }
            } catch (InterruptedException e) {
                logger.warning("Interrupted while waiting for heartbeat scheduler termination for: " + serviceName);
                scheduler.shutdownNow();
                Thread.currentThread().interrupt();
            }
        }
        logger.info("Registration service cleanup completed for: " + serviceName);
    }
}
