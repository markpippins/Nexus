package com.angrysurfer.spring.nexus.controller;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.angrysurfer.spring.nexus.entity.OperatingSystem;
import com.angrysurfer.spring.nexus.repository.OperatingSystemRepository;

@RestController
@RequestMapping("/api/v1/operating-systems")
@CrossOrigin(origins = "*")
@SuppressWarnings("null")
public class OperatingSystemController {

    private static final Logger log = LoggerFactory.getLogger(OperatingSystemController.class);

    private OperatingSystemRepository repository;

    @GetMapping
    public ResponseEntity<com.angrysurfer.nexus.dto.PagedResponse<OperatingSystem>> getAll(org.springframework.data.domain.Pageable pageable) {
        log.info("Fetching all operating systems");
        org.springframework.data.domain.Page<OperatingSystem> operatingSystems = repository.findAll(pageable);
        log.debug("Fetched {} operating systems", operatingSystems.getNumberOfElements());
        return ResponseEntity.ok(com.angrysurfer.spring.nexus.dto.SpringPagedResponse.fromPage(operatingSystems));
    }

    @GetMapping("/{id}")
    public ResponseEntity<OperatingSystem> getById(@PathVariable Long id) {
        log.info("Fetching operating system with id: {}", id);
        return repository.findById(id)
                .map(os -> {
                    log.debug("Found operating system: {}", os.getName());
                    return ResponseEntity.ok(os);
                })
                .orElseGet(() -> {
                    log.warn("Operating system not found with id: {}", id);
                    return ResponseEntity.notFound().build();
                });
    }

    @PostMapping
    public ResponseEntity<OperatingSystem> create(@RequestBody OperatingSystem operatingSystem) {
        log.info("Creating new operating system: {}", operatingSystem.getName());
        OperatingSystem saved = repository.save(operatingSystem);
        log.debug("Created operating system with id: {}", saved.getId());
        java.net.URI location = org.springframework.web.servlet.support.ServletUriComponentsBuilder
                .fromCurrentRequest()
                .path("/{id}")
                .buildAndExpand(saved.getId())
                .toUri();
        return ResponseEntity.created(location).body(saved);
    }

    @PutMapping("/{id}")
    public ResponseEntity<OperatingSystem> update(@PathVariable Long id, @RequestBody OperatingSystem details) {
        log.info("Updating operating system with id: {}", id);
        return repository.findById(id)
                .map(existing -> {
                    existing.setName(details.getName());
                    existing.setVersion(details.getVersion());
                    existing.setLtsFlag(details.getLtsFlag());
                    existing.setActiveFlag(details.getActiveFlag());
                    OperatingSystem updated = repository.save(existing);
                    log.debug("Updated operating system: {}", updated.getName());
                    return ResponseEntity.ok(updated);
                })
                .orElseGet(() -> {
                    log.warn("Operating system not found for update with id: {}", id);
                    return ResponseEntity.notFound().build();
                });
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        log.info("Deleting operating system with id: {}", id);
        return repository.findById(id)
                .map(existing -> {
                    repository.delete(existing);
                    log.debug("Deleted operating system: {}", existing.getName());
                    return ResponseEntity.noContent().<Void>build();
                })
                .orElseGet(() -> {
                    log.warn("Operating system not found for deletion with id: {}", id);
                    return ResponseEntity.notFound().build();
                });
    }
}
