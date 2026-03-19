package com.angrysurfer.spring.nexus.controller;

import com.angrysurfer.spring.nexus.entity.ServiceType;
import com.angrysurfer.spring.nexus.repository.ServiceTypeRepository;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;


@RestController
@RequestMapping("/api/v1/service-types")
@CrossOrigin(origins = "*")
@SuppressWarnings("null")
public class ServiceTypeController {

    private static final Logger log = LoggerFactory.getLogger(ServiceTypeController.class);

    @Autowired
    private ServiceTypeRepository repository;

    @GetMapping
    public ResponseEntity<com.angrysurfer.nexus.dto.PagedResponse<ServiceType>> getAll(org.springframework.data.domain.Pageable pageable) {
        log.info("Fetching all service types");
        org.springframework.data.domain.Page<ServiceType> serviceTypes = repository.findAll(pageable);
        log.debug("Fetched {} service types", serviceTypes.getNumberOfElements());
        return ResponseEntity.ok(com.angrysurfer.spring.nexus.dto.SpringPagedResponse.fromPage(serviceTypes));
    }

    @GetMapping("/{id}")
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
    public ResponseEntity<ServiceType> create(@RequestBody ServiceType serviceType) {
        log.info("Creating service type with name: {}", serviceType.getName());
        try {
            ServiceType savedServiceType = repository.save(serviceType);
            log.info("Service type created successfully with ID: {}", savedServiceType.getId());
            java.net.URI location = org.springframework.web.servlet.support.ServletUriComponentsBuilder
                    .fromCurrentRequest()
                    .path("/{id}")
                    .buildAndExpand(savedServiceType.getId())
                    .toUri();
            return ResponseEntity.created(location).body(savedServiceType);
        } catch (Exception e) {
            log.error("Error creating service type: {}", serviceType.getName(), e);
            throw e;
        }
    }

    @PutMapping("/{id}")
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
