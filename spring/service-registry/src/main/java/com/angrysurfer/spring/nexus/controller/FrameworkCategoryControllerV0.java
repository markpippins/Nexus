package com.angrysurfer.spring.nexus.controller;

import com.angrysurfer.spring.nexus.entity.FrameworkCategory;
import com.angrysurfer.spring.nexus.repository.FrameworkCategoryRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/v0/framework-categories")
@CrossOrigin(origins = "*")
@SuppressWarnings("null")
@Deprecated(since = "v1", forRemoval = true)
public class FrameworkCategoryControllerV0 {

    private static final Logger log = LoggerFactory.getLogger(FrameworkCategoryControllerV0.class);

    private final FrameworkCategoryRepository repository;

    public FrameworkCategoryControllerV0(FrameworkCategoryRepository repository) {
        this.repository = repository;
    }

    @GetMapping
    @Deprecated(since = "v1", forRemoval = true)
    public List<FrameworkCategory> getAll() {
        log.info("Fetching all framework categories");
        List<FrameworkCategory> categories = repository.findAll();
        log.debug("Fetched {} framework categories", categories.size());
        return categories;
    }

    @GetMapping("/{id}")
    @Deprecated(since = "v1", forRemoval = true)
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
    @Deprecated(since = "v1", forRemoval = true)
    public FrameworkCategory create(@RequestBody FrameworkCategory category) {
        log.info("Creating new framework category: {}", category.getName());
        FrameworkCategory saved = repository.save(category);
        log.debug("Created framework category with id: {}", saved.getId());
        return saved;
    }

    @PutMapping("/{id}")
    @Deprecated(since = "v1", forRemoval = true)
    public ResponseEntity<FrameworkCategory> update(@PathVariable Long id, @RequestBody FrameworkCategory details) {
        log.info("Updating framework category with id: {}", id);
        return repository.findById(id)
                .map(existing -> {
                    existing.setName(details.getName());
                    existing.setDescription(details.getDescription());
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
    @Deprecated(since = "v1", forRemoval = true)
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
