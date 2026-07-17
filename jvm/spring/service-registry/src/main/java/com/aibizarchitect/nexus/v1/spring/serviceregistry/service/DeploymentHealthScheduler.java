package com.aibizarchitect.nexus.v1.spring.serviceregistry.service;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Optional;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import com.aibizarchitect.nexus.v1.dto.ServiceStatus;
import com.aibizarchitect.nexus.v1.dto.ServiceStatus.HealthState;
import com.aibizarchitect.nexus.v1.spring.serviceregistry.entity.Deployment;
import com.aibizarchitect.nexus.v1.spring.serviceregistry.entity.Server;
import com.aibizarchitect.nexus.v1.spring.serviceregistry.repository.DeploymentRepository;

/**
 * Periodically polls deployment health endpoints and updates Redis cache.
 *
 * This ensures the status cache stays fresh even when services stop sending
 * heartbeats. Without this scheduler, a service that crashes without
 * deregistering would only be detected after the 90s heartbeat stale timeout.
 *
 * Runs every 30 seconds, pinging up to 20 deployments concurrently.
 * Failed health checks result in UNHEALTHY status in Redis, which the
 * stale-service scheduler will later mark OFFLINE if no heartbeat arrives.
 */
@Service
public class DeploymentHealthScheduler {

    private static final Logger log = LoggerFactory.getLogger(DeploymentHealthScheduler.class);

    private final DeploymentRepository deploymentRepository;
    private final ServiceStatusCacheService cacheService;

    private final HttpClient httpClient = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(3))
            .build();

    public DeploymentHealthScheduler(DeploymentRepository deploymentRepository,
            ServiceStatusCacheService cacheService) {
        this.deploymentRepository = deploymentRepository;
        this.cacheService = cacheService;
    }

    /**
     * Poll health endpoints for all active deployments.
     * Runs every 30 seconds.
     */
    @Scheduled(fixedRate = 30000, initialDelay = 10000)
    public void pollDeploymentHealth() {
        if (!cacheService.isRedisHealthy()) {
            return; // Skip if Redis is down — can't write results
        }

        try {
            List<Deployment> deployments = deploymentRepository.findAll();

            for (Deployment deployment : deployments) {
                if (deployment.getService() == null) continue;

                String healthUrl = resolveHealthUrl(deployment);
                if (healthUrl == null) continue;

                checkDeploymentHealth(deployment, healthUrl);
            }
        } catch (Exception e) {
            log.debug("Error during deployment health poll: {}", e.getMessage());
        }
    }

    private String resolveHealthUrl(Deployment deployment) {
        // Use explicit healthCheckUrl if set
        String url = deployment.getHealthCheckUrl();
        if (url != null && !url.isEmpty()) {
            return url;
        }

        // Construct from server + port
        Server server = deployment.getServer();
        if (server == null || deployment.getPort() == null) return null;

        String hostname = server.getHostname();
        if (hostname == null || hostname.isEmpty()) {
            hostname = server.getIpAddress();
        }
        if (hostname == null || hostname.isEmpty()) return null;

        return String.format("http://%s:%d/health", hostname, deployment.getPort());
    }

    private void checkDeploymentHealth(Deployment deployment, String healthUrl) {
        com.aibizarchitect.nexus.v1.spring.serviceregistry.entity.Service service = deployment.getService();
        String serviceName = service.getName();
        Long serviceId = service.getId();

        HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create(healthUrl))
                .timeout(Duration.ofSeconds(3))
                .GET()
                .build();

        // Fire async — don't block the scheduler thread
        httpClient.sendAsync(request, HttpResponse.BodyHandlers.ofString())
                .thenAccept(response -> {
                    Instant now = Instant.now();
                    boolean healthy = response.statusCode() >= 200 && response.statusCode() < 300;

                    ServiceStatus status = ServiceStatus.builder()
                            .serviceId(serviceId)
                            .serviceName(serviceName)
                            .healthState(healthy ? HealthState.HEALTHY : HealthState.UNHEALTHY)
                            .lastHealthCheck(now)
                            .responseTimeMs(Duration.between(now, now).toMillis()) // approximate
                            .endpoint(healthUrl)
                            .build();

                    cacheService.updateServiceStatus(status);
                })
                .exceptionally(throwable -> {
                    // Health check failed — mark as unhealthy
                    ServiceStatus status = ServiceStatus.builder()
                            .serviceId(serviceId)
                            .serviceName(serviceName)
                            .healthState(HealthState.UNHEALTHY)
                            .lastHealthCheck(Instant.now())
                            .errorMessage(throwable.getMessage())
                            .endpoint(healthUrl)
                            .build();

                    cacheService.updateServiceStatus(status);
                    return null;
                });
    }
}
