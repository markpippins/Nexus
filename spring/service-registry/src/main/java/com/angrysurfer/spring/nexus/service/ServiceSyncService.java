package com.angrysurfer.spring.nexus.service;

import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;

import com.angrysurfer.spring.nexus.broker.api.ServiceRegistration;
import com.angrysurfer.spring.nexus.broker.api.ServiceRequest;
import com.angrysurfer.spring.nexus.repository.ServiceRepository;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;

@Service
public class ServiceSyncService {

    private static final Logger log = LoggerFactory.getLogger(ServiceSyncService.class);

    private final ServiceRepository serviceRepository;
    private final com.angrysurfer.spring.nexus.repository.ServiceTypeRepository serviceTypeRepository;
    private final RestTemplate restTemplate;
    private final ObjectMapper objectMapper;

    @Value("${broker.gateway.url:http://localhost:8080/api/broker/submitRequest}")
    private String brokerUrl;

    public ServiceSyncService(ServiceRepository serviceRepository,
                              com.angrysurfer.spring.nexus.repository.ServiceTypeRepository serviceTypeRepository,
                              ObjectMapper objectMapper) {
        this.serviceRepository = serviceRepository;
        this.serviceTypeRepository = serviceTypeRepository;
        this.restTemplate = new RestTemplate();
        this.objectMapper = objectMapper;
    }

    public void syncServices() {
        log.info("Starting service sync from Broker Gateway at {}", brokerUrl);

        try {
            // Create request to get all services from registry
            ServiceRequest request = new ServiceRequest("serviceRegistry", "getAllServices", 
                    Collections.emptyMap(), "sync-" + System.currentTimeMillis());

            // Call Broker Gateway
            ResponseEntity<Map> responseEntity = restTemplate.postForEntity(brokerUrl, request, Map.class);
            
            if (responseEntity.getStatusCode().is2xxSuccessful() && responseEntity.getBody() != null) {
                Map body = responseEntity.getBody();
                
                // Check if response is OK
                if (Boolean.TRUE.equals(body.get("ok"))) {
                    Object data = body.get("data");
                    List<ServiceRegistration> registrations = objectMapper.convertValue(data, 
                            new TypeReference<List<ServiceRegistration>>() {});

                    processRegistrations(registrations);
                } else {
                    log.error("Broker returned error: {}", body.get("errors"));
                }
            } else {
                log.error("Failed to call Broker Gateway. Status: {}", responseEntity.getStatusCode());
            }

        } catch (Exception e) {
            log.error("Error during service sync", e);
        }
    }

    private void processRegistrations(List<ServiceRegistration> registrations) {
        log.debug("Processing {} service registrations", registrations.size());

        // Fetch default service type
        com.angrysurfer.spring.nexus.entity.ServiceType restApiType =
                serviceTypeRepository.findByName("REST_API").orElse(null);

        int createdCount = 0;
        int updatedCount = 0;

        for (ServiceRegistration reg : registrations) {
            try {
                log.debug("Processing service registration: name={}, endpoint={}, status={}",
                        reg.getServiceName(), reg.getEndpoint(), reg.getStatus());

                Optional<com.angrysurfer.spring.nexus.entity.Service> existingOpt =
                        serviceRepository.findByName(reg.getServiceName());

                com.angrysurfer.spring.nexus.entity.Service service;
                if (existingOpt.isPresent()) {
                    service = existingOpt.get();
                    log.debug("Updating existing service: {} (id={})", service.getName(), service.getId());
                    updatedCount++;
                } else {
                    service = new com.angrysurfer.spring.nexus.entity.Service();
                    service.setName(reg.getServiceName());
                    service.setType(restApiType); // Default
                    service.setDefaultPort(8080); // Default, maybe extract from endpoint if possible
                    log.debug("Creating new service: {}", reg.getServiceName());
                    createdCount++;
                }

                // Map fields
                service.setDescription("Synced from Broker Registry");
                service.setHealthCheckPath(reg.getHealthCheck());
                service.setApiBasePath(reg.getEndpoint());
                
                if (reg.getStatus() == ServiceRegistration.ServiceStatus.HEALTHY) {
                    service.setStatus("ACTIVE");
                } else {
                    service.setStatus("PLANNED");
                }

                serviceRepository.save(service);
                log.debug("Saved service: {} with status={}", service.getName(), service.getStatus());
            } catch (Exception e) {
                log.error("Failed to process registration for service: {}", reg.getServiceName(), e);
            }
        }
        log.info("Service sync completed. Processed {} services (created={}, updated={}).", 
                registrations.size(), createdCount, updatedCount);
    }
}
