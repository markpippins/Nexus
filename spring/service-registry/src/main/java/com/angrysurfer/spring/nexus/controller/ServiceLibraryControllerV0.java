package com.angrysurfer.spring.nexus.controller;

import com.angrysurfer.spring.nexus.entity.ServiceLibrary;
import com.angrysurfer.spring.nexus.repository.ServiceLibraryRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Optional;

@RestController
@RequestMapping("/api/v0/service-libraries")
@CrossOrigin(origins = "*")
public class ServiceLibraryControllerV0 {

    private static final Logger log = LoggerFactory.getLogger(ServiceLibraryControllerV0.class);

    private final ServiceLibraryRepository serviceLibraryRepository;

    public ServiceLibraryControllerV0(ServiceLibraryRepository serviceLibraryRepository) {
        this.serviceLibraryRepository = serviceLibraryRepository;
    }

    @GetMapping
    public List<ServiceLibrary> getAllServiceLibraries() {
        log.info("Fetching all service-library relationships");
        return serviceLibraryRepository.findAll();
    }

    @GetMapping("/{id}")
    public ResponseEntity<ServiceLibrary> getServiceLibraryById(@PathVariable Long id) {
        log.info("Fetching service-library by ID: {}", id);
        Optional<ServiceLibrary> serviceLibrary = serviceLibraryRepository.findById(id);
        return serviceLibrary.map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }

    @GetMapping("/service/{serviceId}")
    public List<ServiceLibrary> getLibrariesByService(@PathVariable Long serviceId) {
        log.info("Fetching libraries for service ID: {}", serviceId);
        return serviceLibraryRepository.findByServiceId(serviceId);
    }

    @GetMapping("/service/{serviceId}/direct")
    public List<ServiceLibrary> getDirectLibrariesByService(@PathVariable Long serviceId) {
        log.info("Fetching direct libraries for service ID: {}", serviceId);
        return serviceLibraryRepository.findByServiceIdAndIsDirect(serviceId, true);
    }

    @GetMapping("/service/{serviceId}/dev")
    public List<ServiceLibrary> getDevLibrariesByService(@PathVariable Long serviceId) {
        log.info("Fetching dev libraries for service ID: {}", serviceId);
        return serviceLibraryRepository.findByServiceIdAndIsDevDependency(serviceId, true);
    }

    @GetMapping("/service/{serviceId}/production")
    public List<ServiceLibrary> getProductionLibrariesByService(@PathVariable Long serviceId) {
        log.info("Fetching production libraries for service ID: {}", serviceId);
        return serviceLibraryRepository.findByServiceIdAndIsDevDependency(serviceId, false);
    }

    @GetMapping("/library/{libraryId}")
    public List<ServiceLibrary> getServicesByLibrary(@PathVariable Long libraryId) {
        log.info("Fetching services using library ID: {}", libraryId);
        return serviceLibraryRepository.findByLibraryId(libraryId);
    }

    @PostMapping
    public ResponseEntity<ServiceLibrary> createServiceLibrary(@RequestBody ServiceLibrary serviceLibrary) {
        log.info("Creating service-library relationship: service={}, library={}",
                serviceLibrary.getServiceId(), serviceLibrary.getLibraryId());

        // Check if already exists
        Optional<ServiceLibrary> existing = serviceLibraryRepository
                .findByServiceIdAndLibraryId(serviceLibrary.getServiceId(), serviceLibrary.getLibraryId());
        if (existing.isPresent()) {
            log.warn("Service-library relationship already exists");
            return ResponseEntity.badRequest().build();
        }

        serviceLibrary.setActiveFlag(true);
        ServiceLibrary saved = serviceLibraryRepository.save(serviceLibrary);
        log.info("Successfully created service-library with ID: {}", saved.getId());
        return ResponseEntity.ok(saved);
    }

    @PutMapping("/{id}")
    public ResponseEntity<ServiceLibrary> updateServiceLibrary(@PathVariable Long id,
            @RequestBody ServiceLibrary serviceLibrary) {
        log.info("Updating service-library with ID: {}", id);

        Optional<ServiceLibrary> existingOpt = serviceLibraryRepository.findById(id);
        if (existingOpt.isEmpty()) {
            log.warn("Service-library with ID {} not found", id);
            return ResponseEntity.notFound().build();
        }

        serviceLibrary.setId(id);
        ServiceLibrary updated = serviceLibraryRepository.save(serviceLibrary);
        log.info("Successfully updated service-library with ID: {}", id);
        return ResponseEntity.ok(updated);
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> deleteServiceLibrary(@PathVariable Long id) {
        log.info("Deleting service-library with ID: {}", id);

        Optional<ServiceLibrary> serviceLibraryOpt = serviceLibraryRepository.findById(id);
        if (serviceLibraryOpt.isEmpty()) {
            log.warn("Service-library with ID {} not found", id);
            return ResponseEntity.notFound().build();
        }

        serviceLibraryRepository.deleteById(id);
        log.info("Successfully deleted service-library with ID: {}", id);
        return ResponseEntity.noContent().build();
    }

    @DeleteMapping("/service/{serviceId}/library/{libraryId}")
    public ResponseEntity<Void> deleteServiceLibraryByServiceAndLibrary(
            @PathVariable Long serviceId, @PathVariable Long libraryId) {
        log.info("Deleting service-library: service={}, library={}", serviceId, libraryId);

        Optional<ServiceLibrary> serviceLibraryOpt = serviceLibraryRepository
                .findByServiceIdAndLibraryId(serviceId, libraryId);
        if (serviceLibraryOpt.isEmpty()) {
            log.warn("Service-library relationship not found");
            return ResponseEntity.notFound().build();
        }

        serviceLibraryRepository.delete(serviceLibraryOpt.get());
        log.info("Successfully deleted service-library relationship");
        return ResponseEntity.noContent().build();
    }
}
