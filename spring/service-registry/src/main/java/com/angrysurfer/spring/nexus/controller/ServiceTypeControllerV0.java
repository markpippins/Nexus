package com.angrysurfer.spring.nexus.controller;

import com.angrysurfer.spring.nexus.entity.ServiceType;
import com.angrysurfer.spring.nexus.repository.ServiceTypeRepository;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/v0/service-types")
@CrossOrigin(origins = "*")
@SuppressWarnings("null")
@Deprecated(since = "v1", forRemoval = true)
public class ServiceTypeControllerV0 {

    private static final Logger log = LoggerFactory.getLogger(ServiceTypeControllerV0.class);

    private final ServiceTypeRepository repository;

    public ServiceTypeControllerV0(ServiceTypeRepository repository) {
        this.repository = repository;
    }

    @GetMapping
    @Deprecated(since = "v1", forRemoval = true)
    public List<ServiceType> getAll() {
        log.info("Fetching all service types");
        List<ServiceType> serviceTypes = repository.findAll();
        log.debug("Fetched {} service types", serviceTypes.size());
        return serviceTypes;
    }

    @GetMapping("/{id}")
    @Deprecated(since = "v1", forRemoval = true)
    public ResponseEntity<ServiceType> getById(@PathVariable Long id) {
        log.info("Fetching service type by ID: {}", id);
        return repository.findById(id)
                .map(serviceType -> {
                    log.debug("Service type found with ID: {}", id);
                    return ResponseEntity.ok(serviceType);
                })
                .orElseGet(() -> {
                    log.warn("Service type not found with ID: {}", id);
                    return ResponseEntity.notFound().build();
                });
    }

    @PostMapping
    @Deprecated(since = "v1", forRemoval = true)
    public ServiceType create(@RequestBody ServiceType serviceType) {
        log.info("Creating service type with name: {}", serviceType.getName());
        try {
            ServiceType savedServiceType = repository.save(serviceType);
            log.info("Service type created successfully with ID: {}", savedServiceType.getId());
            return savedServiceType;
        } catch (Exception e) {
            log.error("Error creating service type: {}", serviceType.getName(), e);
            throw e;
        }
    }

    @PutMapping("/{id}")
    @Deprecated(since = "v1", forRemoval = true)
    public ResponseEntity<ServiceType> update(@PathVariable Long id, @RequestBody ServiceType details) {
        log.info("Updating service type with ID: {}", id);
        return repository.findById(id)
                .map(existing -> {
                    existing.setName(details.getName());
                    existing.setDescription(details.getDescription());
                    ServiceType updatedServiceType = repository.save(existing);
                    log.info("Service type updated successfully with ID: {}", updatedServiceType.getId());
                    return ResponseEntity.ok(updatedServiceType);
                })
                .orElseGet(() -> {
                    log.warn("Service type not found with ID: {} for update", id);
                    return ResponseEntity.notFound().build();
                });
    }

    @DeleteMapping("/{id}")
    @Deprecated(since = "v1", forRemoval = true)
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        log.info("Deleting service type with ID: {}", id);
        return repository.findById(id)
                .map(existing -> {
                    repository.delete(existing);
                    log.info("Service type deleted successfully with ID: {}", id);
                    return ResponseEntity.noContent().<Void>build();
                })
                .orElseGet(() -> {
                    log.warn("Service type not found with ID: {} for deletion", id);
                    return ResponseEntity.notFound().build();
                });
    }
}
