package com.aibizarchitect.nexus.v1.spring.serviceregistry.controller;

import com.aibizarchitect.nexus.v1.spring.serviceregistry.entity.SystemType;
import com.aibizarchitect.nexus.v1.spring.serviceregistry.entity.Systems;
import com.aibizarchitect.nexus.v1.spring.serviceregistry.service.DomainSystemService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

/**
 * REST API for managing domain-level system groupings.
 * Groups services into logical systems (e.g., Harvest Pipeline, Agent Management).
 */
@RestController
@RequestMapping("/api/v1/registry/systems")
@RequiredArgsConstructor
public class DomainSystemController {

    private final DomainSystemService domainSystemService;

    /**
     * Get all system types (categories).
     * GET /api/v1/registry/systems/types
     */
    @GetMapping("/types")
    public ResponseEntity<List<SystemType>> getSystemTypes() {
        return ResponseEntity.ok(domainSystemService.getAllSystemTypes());
    }

    /**
     * Get all systems.
     * GET /api/v1/registry/systems
     */
    @GetMapping
    public ResponseEntity<List<Systems>> getSystems() {
        return ResponseEntity.ok(domainSystemService.getAllSystems());
    }

    /**
     * Get a specific system by name.
     * GET /api/v1/registry/systems/{name}
     */
    @GetMapping("/{name}")
    public ResponseEntity<Systems> getSystem(@PathVariable String name) {
        return domainSystemService.getSystem(name)
                .map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }

    /**
     * Get all services belonging to a system.
     * GET /api/v1/registry/systems/{name}/services
     */
    @GetMapping("/{name}/services")
    public ResponseEntity<List<?>> getServicesInSystem(@PathVariable String name) {
        return ResponseEntity.ok(domainSystemService.getServicesInSystem(name));
    }

    /**
     * Get all systems a service belongs to.
     * GET /api/v1/registry/systems/by-service/{serviceName}
     */
    @GetMapping("/by-service/{serviceName}")
    public ResponseEntity<List<?>> getSystemsForService(@PathVariable String serviceName) {
        return ResponseEntity.ok(domainSystemService.getSystemsForService(serviceName));
    }

    /**
     * Get summary of all systems with service counts.
     * GET /api/v1/registry/systems/summary
     */
    @GetMapping("/summary")
    public ResponseEntity<List<Map<String, Object>>> getSystemSummary() {
        return ResponseEntity.ok(domainSystemService.getSystemSummary());
    }

    /**
     * Create a new system type.
     * POST /api/v1/registry/systems/types
     */
    @PostMapping("/types")
    public ResponseEntity<SystemType> createSystemType(@RequestBody Map<String, String> body) {
        String name = body.get("name");
        String description = body.get("description");

        if (name == null || name.isBlank()) {
            return ResponseEntity.badRequest().build();
        }

        try {
            SystemType type = domainSystemService.createSystemType(name, description);
            return ResponseEntity.ok(type);
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().build();
        }
    }

    /**
     * Create a new system.
     * POST /api/v1/registry/systems
     */
    @PostMapping
    public ResponseEntity<Systems> createSystem(@RequestBody Map<String, String> body) {
        String name = body.get("name");
        String typeName = body.get("type");
        String description = body.get("description");

        if (name == null || name.isBlank() || typeName == null || typeName.isBlank()) {
            return ResponseEntity.badRequest().build();
        }

        try {
            Systems system = domainSystemService.createSystem(name, typeName, description);
            return ResponseEntity.ok(system);
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().build();
        }
    }

    /**
     * Add a service to a system.
     * POST /api/v1/registry/systems/{systemName}/services/{serviceName}
     */
    @PostMapping("/{systemName}/services/{serviceName}")
    public ResponseEntity<?> addServiceToSystem(
            @PathVariable String systemName,
            @PathVariable String serviceName,
            @RequestParam(defaultValue = "worker") String role) {
        try {
            var ss = domainSystemService.addServiceToSystem(systemName, serviceName, role);
            return ResponseEntity.ok(ss);
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    /**
     * Remove a service from a system.
     * DELETE /api/v1/registry/systems/{systemName}/services/{serviceName}
     */
    @DeleteMapping("/{systemName}/services/{serviceName}")
    public ResponseEntity<Void> removeServiceFromSystem(
            @PathVariable String systemName,
            @PathVariable String serviceName) {
        domainSystemService.removeServiceFromSystem(systemName, serviceName);
        return ResponseEntity.noContent().build();
    }
}
