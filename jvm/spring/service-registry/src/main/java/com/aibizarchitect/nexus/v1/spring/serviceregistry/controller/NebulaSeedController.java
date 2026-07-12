package com.aibizarchitect.nexus.v1.spring.serviceregistry.controller;

import java.util.HashMap;
import java.util.Map;
import java.util.Optional;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.aibizarchitect.nexus.v1.spring.serviceregistry.entity.EnvironmentType;
import com.aibizarchitect.nexus.v1.spring.serviceregistry.entity.Framework;
import com.aibizarchitect.nexus.v1.spring.serviceregistry.entity.Server;
import com.aibizarchitect.nexus.v1.spring.serviceregistry.entity.Service;
import com.aibizarchitect.nexus.v1.spring.serviceregistry.entity.ServiceType;
import com.aibizarchitect.nexus.v1.spring.serviceregistry.repository.EnvironmentTypeRepository;
import com.aibizarchitect.nexus.v1.spring.serviceregistry.repository.FrameworkRepository;
import com.aibizarchitect.nexus.v1.spring.serviceregistry.repository.ServerRepository;
import com.aibizarchitect.nexus.v1.spring.serviceregistry.repository.ServiceRepository;
import com.aibizarchitect.nexus.v1.spring.serviceregistry.repository.ServiceTypeRepository;

@RestController
@RequestMapping("/api/v1/seed")
public class NebulaSeedController {

    private static final Logger log = LoggerFactory.getLogger(NebulaSeedController.class);

    private final ServiceRepository serviceRepository;
    private final FrameworkRepository frameworkRepository;
    private final ServiceTypeRepository serviceTypeRepository;
    private final ServerRepository serverRepository;
    private final EnvironmentTypeRepository environmentTypeRepository;

    public NebulaSeedController(
            ServiceRepository serviceRepository,
            FrameworkRepository frameworkRepository,
            ServiceTypeRepository serviceTypeRepository,
            ServerRepository serverRepository,
            EnvironmentTypeRepository environmentTypeRepository) {
        this.serviceRepository = serviceRepository;
        this.frameworkRepository = frameworkRepository;
        this.serviceTypeRepository = serviceTypeRepository;
        this.serverRepository = serverRepository;
        this.environmentTypeRepository = environmentTypeRepository;
    }

    @PostMapping
    @Transactional
    public ResponseEntity<Map<String, Object>> seedDefaultExample() {
        log.info("Seeding nebula default example data...");
        Map<String, Object> result = new HashMap<>();
        Map<String, Object> created = new HashMap<>();
        Map<String, Object> skipped = new HashMap<>();

        Framework framework = frameworkRepository.findByName("Spring Boot").orElse(null);
        ServiceType webAppType = serviceTypeRepository.findByName("Web App").orElse(null);
        ServiceType restApiType = serviceTypeRepository.findByName("REST API").orElse(null);
        ServiceType gatewayType = serviceTypeRepository.findByName("Gateway").orElse(null);
        Server server = serverRepository.findByHostname("osmium").orElse(null);
        EnvironmentType devEnv = environmentTypeRepository.findByName("Development").orElse(null);

        if (framework == null) {
            log.warn("Framework 'Spring Boot' not found — cannot seed");
            result.put("error", "Required lookup data not found. Ensure DataInitializer has run.");
            return ResponseEntity.status(500).body(result);
        }
        if (server == null) {
            log.warn("Server 'osmium' not found — cannot seed");
            result.put("error", "Seed server 'osmium' not found. Ensure DataInitializer has run.");
            return ResponseEntity.status(500).body(result);
        }
        if (devEnv == null) {
            log.warn("Environment 'Development' not found");
            result.put("error", "Required lookup data not found.");
            return ResponseEntity.status(500).body(result);
        }

        if (webAppType == null || restApiType == null || gatewayType == null) {
            log.warn("Required service types not found (Web App, REST API, Gateway)");
            result.put("error", "Required service types not found.");
            return ResponseEntity.status(500).body(result);
        }

        Service ecommerceService = createServiceIfNotExists(
                "E-Commerce Platform",
                "Enterprise e-commerce platform providing online retail capabilities with product catalog, shopping cart, and order management",
                framework, webAppType, null,
                created, skipped);

        if (ecommerceService != null) {
            Service checkoutService = createServiceIfNotExists(
                    "Checkout",
                    "Checkout subsystem handling cart-to-order conversion, payment processing orchestration, shipping calculation, and order validation",
                    framework, restApiType, ecommerceService,
                    created, skipped);

            if (checkoutService != null) {
                createServiceIfNotExists(
                        "Payment Gateway",
                        "Payment gateway feature processing credit card, digital wallet, and buy-now-pay-later transactions through external PSP integrations",
                        framework, gatewayType, checkoutService,
                        created, skipped);
            }
        }

        result.put("seeded", created.size() > 0);
        result.put("created", created);
        result.put("skipped", skipped);
        result.put("createdCount", created.size());
        result.put("skippedCount", skipped.size());
        result.put("message", created.size() > 0
                ? "Seeded " + created.size() + " nebula default example service(s)"
                : "All nebula default example services already exist");

        log.info("Seed complete: created={}, skipped={}", created.size(), skipped.size());
        return ResponseEntity.ok(result);
    }

    private Service createServiceIfNotExists(
            String name,
            String description,
            Framework framework,
            ServiceType type,
            Service parentService,
            Map<String, Object> created,
            Map<String, Object> skipped) {
        Optional<Service> existing = serviceRepository.findByName(name);
        if (existing.isPresent()) {
            log.info("Service '{}' already exists — skipping", name);
            skipped.put(name, true);
            return existing.get();
        }

        Service service = new Service();
        service.setName(name);
        service.setDescription(description);
        service.setFramework(framework);
        service.setType(type);
        service.setParentService(parentService);
        service.setStatus("ACTIVE");
        service.setVersion("1.0.0");

        Service saved = serviceRepository.save(service);
        log.info("Created service '{}' (id={})", name, saved.getId());
        created.put(name, true);
        return saved;
    }
}
