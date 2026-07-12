package com.aibizarchitect.nexus.v1.spring.serviceregistry.controller;

import java.util.Optional;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.aibizarchitect.nexus.v1.spring.serviceregistry.entity.FrameworkType;
import com.aibizarchitect.nexus.v1.spring.serviceregistry.repository.FrameworkTypeRepository;

@RestController
@RequestMapping("/api/v1/framework-categories")
public class FrameworkTypeController {

    private static final Logger log = LoggerFactory.getLogger(FrameworkTypeController.class);

    private final FrameworkTypeRepository repository;

    public FrameworkTypeController(FrameworkTypeRepository repository) {
        this.repository = repository;
    }

    @GetMapping
    public ResponseEntity<?> getAll(
            @RequestParam(required = false) String name,
            org.springframework.data.domain.Pageable pageable) {
        log.info("Fetching all framework types");
        if (name != null && !name.isEmpty()) {
            log.info("Filtering by name: {}", name);
            return repository.findByName(name)
                    .map(ResponseEntity::ok)
                    .orElse(ResponseEntity.notFound().build());
        }
        return ResponseEntity.ok(com.aibizarchitect.nexus.v1.spring.serviceregistry.dto.SpringPagedResponse.fromPage(
                repository.findAll(pageable)));
    }

    @GetMapping("/{id}")
    public ResponseEntity<FrameworkType> getById(@PathVariable Long id) {
        log.info("Fetching framework type with id: {}", id);
        return repository.findById(id)
                .map(frameworkType -> {
                    log.debug("Found framework type: {}", frameworkType.getName());
                    return ResponseEntity.ok(frameworkType);
                })
                .orElseGet(() -> {
                    log.warn("Framework type not found with id: {}", id);
                    return ResponseEntity.notFound().build();
                });
    }

    @PostMapping
    public ResponseEntity<FrameworkType> create(@RequestBody FrameworkType frameworkType) {
        log.info("Creating new framework type: {}", frameworkType.getName());

        // Validate that name is unique
        if (repository.findByName(frameworkType.getName()).isPresent()) {
            log.warn("Framework type with name {} already exists", frameworkType.getName());
            return ResponseEntity.badRequest().build();
        }

        frameworkType.setActiveFlag(true);
        FrameworkType saved = repository.save(frameworkType);
        log.debug("Created framework type with id: {}", saved.getId());
        java.net.URI location = org.springframework.web.servlet.support.ServletUriComponentsBuilder
                .fromCurrentRequest()
                .path("/{id}")
                .buildAndExpand(saved.getId())
                .toUri();
        return ResponseEntity.created(location).body(saved);
    }

    @PutMapping("/{id}")
    public ResponseEntity<FrameworkType> update(@PathVariable Long id, @RequestBody FrameworkType details) {
        log.info("Updating framework type with id: {}", id);

        Optional<FrameworkType> existing = repository.findById(id);
        if (existing.isEmpty()) {
            log.warn("Framework type not found for update with id: {}", id);
            return ResponseEntity.notFound().build();
        }

        // Check if name is being changed and if new name already exists
        if (!existing.get().getName().equals(details.getName())) {
            if (repository.findByName(details.getName()).isPresent()) {
                log.warn("Framework type with name {} already exists", details.getName());
                return ResponseEntity.badRequest().build();
            }
        }

        FrameworkType updated = repository.save(details);
        updated.setId(id);
        log.debug("Updated framework type: {}", updated.getName());
        return ResponseEntity.ok(updated);
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        log.info("Deleting framework type with id: {}", id);
        return repository.findById(id)
                .map(existing -> {
                    repository.delete(existing);
                    log.debug("Deleted framework type: {}", existing.getName());
                    return ResponseEntity.noContent().<Void>build();
                })
                .orElseGet(() -> {
                    log.warn("Framework type not found for deletion with id: {}", id);
                    return ResponseEntity.notFound().build();
                });
    }
}
