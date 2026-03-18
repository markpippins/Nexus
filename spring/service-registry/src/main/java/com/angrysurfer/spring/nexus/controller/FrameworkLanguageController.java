package com.angrysurfer.spring.nexus.controller;

import java.util.List;

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

import com.angrysurfer.spring.nexus.entity.FrameworkLanguage;
import com.angrysurfer.spring.nexus.repository.FrameworkLanguageRepository;

@RestController
@RequestMapping("/api/v1/framework-languages")
@CrossOrigin(origins = "*")
@SuppressWarnings("null")
public class FrameworkLanguageController {

    private static final Logger log = LoggerFactory.getLogger(FrameworkLanguageController.class);

    @Autowired
    private FrameworkLanguageRepository repository;

    @GetMapping
    public ResponseEntity<com.angrysurfer.spring.nexus.dto.PagedResponse<FrameworkLanguage>> getAll(org.springframework.data.domain.Pageable pageable) {
        log.info("Fetching all framework languages");
        org.springframework.data.domain.Page<FrameworkLanguage> languages = repository.findAll(pageable);
        log.debug("Fetched {} framework languages", languages.getNumberOfElements());
        return ResponseEntity.ok(new com.angrysurfer.spring.nexus.dto.PagedResponse<>(languages));
    }

    @GetMapping("/{id}")
    public ResponseEntity<FrameworkLanguage> getById(@PathVariable Long id) {
        log.info("Fetching framework language by ID: {}", id);
        return repository.findById(id)
                .map(language -> {
                    log.debug("Framework language found with ID: {}", id);
                    return ResponseEntity.ok(language);
                })
                .orElseGet(() -> {
                    log.warn("Framework language not found with ID: {}", id);
                    return ResponseEntity.notFound().build();
                });
    }

    @PostMapping
    public ResponseEntity<FrameworkLanguage> create(@RequestBody FrameworkLanguage language) {
        log.info("Creating framework language: {}", language.getName());
        try {
            FrameworkLanguage saved = repository.save(language);
            log.debug("Framework language created successfully with ID: {}", saved.getId());
            java.net.URI location = org.springframework.web.servlet.support.ServletUriComponentsBuilder
                    .fromCurrentRequest()
                    .path("/{id}")
                    .buildAndExpand(saved.getId())
                    .toUri();
            return ResponseEntity.created(location).body(saved);
        } catch (Exception e) {
            log.error("Error creating framework language: {}", language.getName(), e);
            throw e;
        }
    }

    @PutMapping("/{id}")
    public ResponseEntity<FrameworkLanguage> update(@PathVariable Long id, @RequestBody FrameworkLanguage details) {
        log.info("Updating framework language with ID: {}", id);
        return repository.findById(id)
                .map(existing -> {
                    existing.setName(details.getName());
                    existing.setDescription(details.getDescription());
                    FrameworkLanguage updated = repository.save(existing);
                    log.debug("Framework language updated successfully with ID: {}", updated.getId());
                    return ResponseEntity.ok(updated);
                })
                .orElseGet(() -> {
                    log.warn("Framework language not found with ID: {} for update", id);
                    return ResponseEntity.notFound().build();
                });
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        log.info("Deleting framework language with ID: {}", id);
        return repository.findById(id)
                .map(existing -> {
                    repository.delete(existing);
                    log.debug("Framework language deleted successfully with ID: {}", id);
                    return ResponseEntity.noContent().<Void>build();
                })
                .orElseGet(() -> {
                    log.warn("Framework language not found with ID: {} for deletion", id);
                    return ResponseEntity.notFound().build();
                });
    }
}
