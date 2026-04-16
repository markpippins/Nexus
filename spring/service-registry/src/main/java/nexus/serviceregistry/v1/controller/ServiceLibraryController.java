package nexus.serviceregistry.v1.controller;

import java.util.Optional;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import nexus.serviceregistry.v1.entity.ServiceLibrary;
import nexus.serviceregistry.v1.repository.ServiceLibraryRepository;

@RestController
@RequestMapping("/api/v1/service-libraries")
@CrossOrigin(origins = "*")
public class ServiceLibraryController {

    private static final Logger log = LoggerFactory.getLogger(ServiceLibraryController.class);

    private final ServiceLibraryRepository serviceLibraryRepository;

    public ServiceLibraryController(ServiceLibraryRepository serviceLibraryRepository) {
        this.serviceLibraryRepository = serviceLibraryRepository;
    }

    @GetMapping
    public ResponseEntity<?> getServiceLibraries(
            @RequestParam(required = false) Long serviceId,
            @RequestParam(required = false) Long libraryId,
            @RequestParam(required = false) Boolean direct,
            @RequestParam(required = false) Boolean dev,
            @RequestParam(required = false) Boolean production,
            org.springframework.data.domain.Pageable pageable) {

        if (serviceId != null) {
            if (Boolean.TRUE.equals(direct)) {
                log.info("Fetching direct libraries for service ID: {}", serviceId);
                return ResponseEntity.ok(nexus.serviceregistry.v1.dto.SpringPagedResponse
                        .fromPage(serviceLibraryRepository.findByServiceIdAndIsDirect(serviceId, true, pageable)));
            } else if (Boolean.TRUE.equals(dev)) {
                log.info("Fetching dev libraries for service ID: {}", serviceId);
                return ResponseEntity.ok(nexus.serviceregistry.v1.dto.SpringPagedResponse.fromPage(
                        serviceLibraryRepository.findByServiceIdAndIsDevDependency(serviceId, true, pageable)));
            } else if (Boolean.TRUE.equals(production)) {
                log.info("Fetching production libraries for service ID: {}", serviceId);
                return ResponseEntity.ok(nexus.serviceregistry.v1.dto.SpringPagedResponse.fromPage(
                        serviceLibraryRepository.findByServiceIdAndIsDevDependency(serviceId, false, pageable)));
            } else {
                log.info("Fetching libraries for service ID: {}", serviceId);
                return ResponseEntity.ok(nexus.serviceregistry.v1.dto.SpringPagedResponse
                        .fromPage(serviceLibraryRepository.findByServiceId(serviceId, pageable)));
            }
        } else if (libraryId != null) {
            log.info("Fetching services using library ID: {}", libraryId);
            return ResponseEntity.ok(nexus.serviceregistry.v1.dto.SpringPagedResponse
                    .fromPage(serviceLibraryRepository.findByLibraryId(libraryId, pageable)));
        } else {
            log.info("Fetching all service-library relationships");
            return ResponseEntity.ok(nexus.serviceregistry.v1.dto.SpringPagedResponse
                    .fromPage(serviceLibraryRepository.findAll(pageable)));
        }
    }

    @GetMapping("/{id}")
    public ResponseEntity<ServiceLibrary> getServiceLibraryById(@PathVariable Long id) {
        log.info("Fetching service-library by ID: {}", id);
        Optional<ServiceLibrary> serviceLibrary = serviceLibraryRepository.findById(id);
        return serviceLibrary.map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
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
        java.net.URI location = org.springframework.web.servlet.support.ServletUriComponentsBuilder
                .fromCurrentRequest()
                .path("/{id}")
                .buildAndExpand(saved.getId())
                .toUri();
        return ResponseEntity.created(location).body(saved);
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
