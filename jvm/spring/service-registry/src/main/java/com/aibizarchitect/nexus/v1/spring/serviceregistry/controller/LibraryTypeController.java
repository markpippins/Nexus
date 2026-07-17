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

import com.aibizarchitect.nexus.v1.spring.serviceregistry.entity.LibraryType;
import com.aibizarchitect.nexus.v1.spring.serviceregistry.repository.LibraryTypeRepository;

@RestController
@RequestMapping("/api/v1/library-categories")
public class LibraryTypeController {

    private static final Logger log = LoggerFactory.getLogger(LibraryTypeController.class);

    private final LibraryTypeRepository repository;

    public LibraryTypeController(LibraryTypeRepository repository) {
        this.repository = repository;
    }

    @GetMapping
    public ResponseEntity<?> getAll(
            @RequestParam(required = false) String name,
            org.springframework.data.domain.Pageable pageable) {
        log.info("Fetching all library types");
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
    public ResponseEntity<LibraryType> getById(@PathVariable Long id) {
        log.info("Fetching library type with id: {}", id);
        return repository.findById(id)
                .map(libraryType -> {
                    log.debug("Found library type: {}", libraryType.getName());
                    return ResponseEntity.ok(libraryType);
                })
                .orElseGet(() -> {
                    log.warn("Library type not found with id: {}", id);
                    return ResponseEntity.notFound().build();
                });
    }

    @PostMapping
    public ResponseEntity<LibraryType> create(@RequestBody LibraryType libraryType) {
        log.info("Creating new library type: {}", libraryType.getName());

        if (repository.findByName(libraryType.getName()).isPresent()) {
            log.warn("Library type with name {} already exists", libraryType.getName());
            return ResponseEntity.badRequest().build();
        }

        libraryType.setActiveFlag(true);
        LibraryType saved = repository.save(libraryType);
        log.debug("Created library type with id: {}", saved.getId());
        java.net.URI location = org.springframework.web.servlet.support.ServletUriComponentsBuilder
                .fromCurrentRequest()
                .path("/{id}")
                .buildAndExpand(saved.getId())
                .toUri();
        return ResponseEntity.created(location).body(saved);
    }

    @PutMapping("/{id}")
    public ResponseEntity<LibraryType> update(@PathVariable Long id, @RequestBody LibraryType details) {
        log.info("Updating library type with id: {}", id);

        Optional<LibraryType> existing = repository.findById(id);
        if (existing.isEmpty()) {
            log.warn("Library type not found for update with id: {}", id);
            return ResponseEntity.notFound().build();
        }

        if (!existing.get().getName().equals(details.getName())) {
            if (repository.findByName(details.getName()).isPresent()) {
                log.warn("Library type with name {} already exists", details.getName());
                return ResponseEntity.badRequest().build();
            }
        }

        details.setId(id);
        LibraryType updated = repository.save(details);
        log.debug("Updated library type: {}", updated.getName());
        return ResponseEntity.ok(updated);
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        log.info("Deleting library type with id: {}", id);
        return repository.findById(id)
                .map(existing -> {
                    repository.delete(existing);
                    log.debug("Deleted library type: {}", existing.getName());
                    return ResponseEntity.noContent().<Void>build();
                })
                .orElseGet(() -> {
                    log.warn("Library type not found for deletion with id: {}", id);
                    return ResponseEntity.notFound().build();
                });
    }
}
