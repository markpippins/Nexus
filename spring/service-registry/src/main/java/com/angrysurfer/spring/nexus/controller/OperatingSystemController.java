package com.angrysurfer.spring.nexus.controller;

import com.angrysurfer.spring.nexus.entity.OperatingSystem;
import com.angrysurfer.spring.nexus.repository.OperatingSystemRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/operating-systems")
@CrossOrigin(origins = "*")
@SuppressWarnings("null")
public class OperatingSystemController {

    private static final Logger log = LoggerFactory.getLogger(OperatingSystemController.class);

    @Autowired
    private OperatingSystemRepository repository;

    @GetMapping
    public List<OperatingSystem> getAll() {
        log.info("Fetching all operating systems");
        List<OperatingSystem> operatingSystems = repository.findAll();
        log.debug("Fetched {} operating systems", operatingSystems.size());
        return operatingSystems;
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
    public OperatingSystem create(@RequestBody OperatingSystem operatingSystem) {
        log.info("Creating new operating system: {}", operatingSystem.getName());
        OperatingSystem saved = repository.save(operatingSystem);
        log.debug("Created operating system with id: {}", saved.getId());
        return saved;
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
