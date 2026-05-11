package com.aibizarchitect.nexus.v1.spring.serviceregistry.controller;

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
import org.springframework.web.bind.annotation.RestController;

import com.aibizarchitect.nexus.v1.spring.serviceregistry.entity.FrameworkCategory;
import com.aibizarchitect.nexus.v1.spring.serviceregistry.repository.FrameworkCategoryRepository;

@RestController
@RequestMapping("/api/v1/framework-categories")
@CrossOrigin(origins = "*")
@SuppressWarnings("null")
public class FrameworkCategoryController {

    private static final Logger log = LoggerFactory.getLogger(FrameworkCategoryController.class);

    private final FrameworkCategoryRepository repository;

    public FrameworkCategoryController(FrameworkCategoryRepository repository) {
        this.repository = repository;
    }

    @GetMapping
    public ResponseEntity<com.aibizarchitect.nexus.v1.dto.PagedResponse<FrameworkCategory>> getAll(org.springframework.data.domain.Pageable pageable) {
        log.info("Fetching all framework categories");
        org.springframework.data.domain.Page<FrameworkCategory> categories = repository.findAll(pageable);
        log.debug("Fetched {} framework categories", categories.getNumberOfElements());
        return ResponseEntity.ok(com.aibizarchitect.nexus.v1.spring.serviceregistry.dto.SpringPagedResponse.fromPage(categories));
    }

    @GetMapping("/{id}")
    public ResponseEntity<FrameworkCategory> getById(@PathVariable Long id) {
        log.info("Fetching framework category with id: {}", id);
        return repository.findById(id)
                .map(category -> {
                    log.debug("Found framework category: {}", category.getName());
                    return ResponseEntity.ok(category);
                })
                .orElseGet(() -> {
                    log.warn("Framework category not found with id: {}", id);
                    return ResponseEntity.notFound().build();
                });
    }

    @PostMapping
    public ResponseEntity<FrameworkCategory> create(@RequestBody FrameworkCategory category) {
        log.info("Creating new framework category: {}", category.getName());
        FrameworkCategory saved = repository.save(category);
        log.debug("Created framework category with id: {}", saved.getId());
        java.net.URI location = org.springframework.web.servlet.support.ServletUriComponentsBuilder
                .fromCurrentRequest()
                .path("/{id}")
                .buildAndExpand(saved.getId())
                .toUri();
        return ResponseEntity.created(location).body(saved);
    }

    @PutMapping("/{id}")
    public ResponseEntity<FrameworkCategory> update(@PathVariable Long id, @RequestBody FrameworkCategory details) {
        log.info("Updating framework category with id: {}", id);
        return repository.findById(id)
                .map(existing -> {
                    existing.setName(details.getName());
                    existing.setActiveFlag(details.getActiveFlag());
                    FrameworkCategory updated = repository.save(existing);
                    log.debug("Updated framework category: {}", updated.getName());
                    return ResponseEntity.ok(updated);
                })
                .orElseGet(() -> {
                    log.warn("Framework category not found for update with id: {}", id);
                    return ResponseEntity.notFound().build();
                });
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        log.info("Deleting framework category with id: {}", id);
        return repository.findById(id)
                .map(existing -> {
                    repository.delete(existing);
                    log.debug("Deleted framework category: {}", existing.getName());
                    return ResponseEntity.noContent().<Void>build();
                })
                .orElseGet(() -> {
                    log.warn("Framework category not found for deletion with id: {}", id);
                    return ResponseEntity.notFound().build();
                });
    }
}
