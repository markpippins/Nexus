package com.angrysurfer.spring.nexus.broker;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestTemplate;

import jakarta.annotation.PreDestroy;

/**
 * Shared heartbeat client for registering Spring services with the
 * service-registry.
 * 
 * Each service module that includes broker-service can enable this by setting:
 * service.registry.registration.enabled=true
 * 
 * Required configuration properties:
 * - service.registry.url: Base URL of the service-registry (default:
 * http://localhost:8085)
 * - service.name: Unique name for this service (required)
 * - server.port: Port this service runs on (default: 8080)
 * - service.host: Hostname for this service (default: localhost)
 * - service.framework: Framework name (default: Spring Boot)
 * - heartbeat.interval.ms: Milliseconds between heartbeats (default: 30000)
 */
@Component
@EnableScheduling
@ConditionalOnProperty(name = "service.registry.registration.enabled", havingValue = "true")
public class ServiceRegistryHeartbeatClient {

    private static final Logger LOG = LoggerFactory.getLogger(ServiceRegistryHeartbeatClient.class);

    @Value("${service.registry.url:http://localhost:8085}")
    private String hostServerUrl;

    @Value("${service.name}")
    private String serviceName;

    @Value("${server.port:8080}")
    private int servicePort;

    @Value("${service.host:localhost}")
    private String serviceHost;

    @Value("${service.framework:Spring Boot}")
    private String framework;

    @Value("${service.version:1.0.0}")
    private String version;

    @Value("${service.operations:healthCheck}")
    private String operationsString;

    private final RestTemplate restTemplate;
    private volatile boolean registered = false;

    public ServiceRegistryHeartbeatClient() {
        this.restTemplate = new RestTemplate();
    }

    /**
     * Register with service-registry when application is ready
     */
    @EventListener(ApplicationReadyEvent.class)
    public void onApplicationReady() {
        LOG.info("Starting service-registry registration for service: {}", serviceName);
        registerService();
    }

    /**
     * Clean shutdown logging
     */
    @PreDestroy
    public void onShutdown() {
        LOG.info("Service {} shutting down, stopping heartbeats", serviceName);
    }

    /**
     * Register this service with the service-registry registry
     */
    private void registerService() {
        String endpoint = String.format("http://%s:%d", serviceHost, servicePort);
        String healthCheckUrl = endpoint + "/actuator/health";

        Map<String, Object> registration = new HashMap<>();
        registration.put("serviceName", serviceName);
        registration.put("endpoint", endpoint);
        registration.put("healthCheck", healthCheckUrl);
        registration.put("framework", framework);
        registration.put("version", version);
        registration.put("port", servicePort);

        // Parse operations from comma-separated string
        List<String> operations = List.of(operationsString.split(","));
        registration.put("operations", operations);

        try {
            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_JSON);
            HttpEntity<Map<String, Object>> request = new HttpEntity<>(registration, headers);

            String url = hostServerUrl + "/api/registry/register";
            ResponseEntity<String> response = restTemplate.postForEntity(url, request, String.class);

            if (response.getStatusCode().is2xxSuccessful()) {
                registered = true;
                LOG.info("Successfully registered {} with service-registry at {}", serviceName, hostServerUrl);
            } else {
                LOG.warn("Failed to register {} with service-registry. Status: {}", serviceName,
                        response.getStatusCode());
            }
        } catch (Exception e) {
            LOG.warn("Failed to register {} with service-registry: {}", serviceName, e.getMessage());
            // Don't fail startup if registration fails - heartbeat will retry
        }
    }

    /**
     * Send periodic heartbeat to maintain active status in service-registry.
     * Runs every 30 seconds by default (configurable via heartbeat.interval.ms)
     */
    @Scheduled(fixedRateString = "${heartbeat.interval.ms:30000}", initialDelay = 5000)
    public void sendHeartbeat() {
        if (!registered) {
            // Try to register again if initial registration failed
            registerService();
            return;
        }

        try {
            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_JSON);
            HttpEntity<String> request = new HttpEntity<>("{}", headers);

            String url = hostServerUrl + "/api/registry/heartbeat/" + serviceName;
            ResponseEntity<String> response = restTemplate.postForEntity(url, request, String.class);

            if (response.getStatusCode().is2xxSuccessful()) {
                LOG.debug("Heartbeat sent successfully for {}", serviceName);
            } else {
                LOG.warn("Heartbeat failed for {}. Status: {}", serviceName, response.getStatusCode());
            }
        } catch (Exception e) {
            LOG.warn("Failed to send heartbeat for {}: {}", serviceName, e.getMessage());
            // Mark as not registered to trigger re-registration on next cycle
            registered = false;
        }
    }

    /**
     * Check if this client is currently registered with the service-registry
     */
    public boolean isRegistered() {
        return registered;
    }
}
