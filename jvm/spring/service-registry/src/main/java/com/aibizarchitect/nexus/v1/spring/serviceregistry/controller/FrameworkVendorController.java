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

import com.aibizarchitect.nexus.v1.spring.serviceregistry.entity.FrameworkVendor;
import com.aibizarchitect.nexus.v1.spring.serviceregistry.repository.FrameworkVendorRepository;

@RestController
@RequestMapping("/api/v1/framework-vendors")
@CrossOrigin(origins = "*")
@SuppressWarnings("null")
public class FrameworkVendorController {

    private static final Logger log = LoggerFactory.getLogger(FrameworkVendorController.class);

    private final FrameworkVendorRepository repository;

    public FrameworkVendorController(FrameworkVendorRepository repository) {
        this.repository = repository;
    }

    @GetMapping
    public ResponseEntity<com.aibizarchitect.nexus.v1.dto.PagedResponse<FrameworkVendor>> getAll(org.springframework.data.domain.Pageable pageable) {
        log.info("Fetching all framework vendors");
        org.springframework.data.domain.Page<FrameworkVendor> vendors = repository.findAll(pageable);
        log.debug("Fetched {} framework vendors", vendors.getNumberOfElements());
        return ResponseEntity.ok(com.aibizarchitect.nexus.v1.spring.serviceregistry.dto.SpringPagedResponse.fromPage(vendors));
    }

    @GetMapping("/{id}")
    public ResponseEntity<FrameworkVendor> getById(@PathVariable Long id) {
        log.info("Fetching framework vendor by ID: {}", id);
        return repository.findById(id)
                .map(vendor -> {
                    log.debug("Framework vendor found with ID: {}", id);
                    return ResponseEntity.ok(vendor);
                })
                .orElseGet(() -> {
                    log.warn("Framework vendor not found with ID: {}", id);
                    return ResponseEntity.notFound().build();
                });
    }

    @PostMapping
    public ResponseEntity<FrameworkVendor> create(@RequestBody FrameworkVendor vendor) {
        log.info("Creating framework vendor: {}", vendor.getName());
        try {
            FrameworkVendor saved = repository.save(vendor);
            log.debug("Framework vendor created successfully with ID: {}", saved.getId());
            java.net.URI location = org.springframework.web.servlet.support.ServletUriComponentsBuilder
                    .fromCurrentRequest()
                    .path("/{id}")
                    .buildAndExpand(saved.getId())
                    .toUri();
            return ResponseEntity.created(location).body(saved);
        } catch (Exception e) {
            log.error("Error creating framework vendor: {}", vendor.getName(), e);
            throw e;
        }
    }

    @PutMapping("/{id}")
    public ResponseEntity<FrameworkVendor> update(@PathVariable Long id, @RequestBody FrameworkVendor details) {
        log.info("Updating framework vendor with ID: {}", id);
        return repository.findById(id)
                .map(existing -> {
                    existing.setName(details.getName());
                    existing.setDescription(details.getDescription());
                    existing.setUrl(details.getUrl());
                    existing.setActiveFlag(details.getActiveFlag());
                    FrameworkVendor updated = repository.save(existing);
                    log.debug("Framework vendor updated successfully with ID: {}", updated.getId());
                    return ResponseEntity.ok(updated);
                })
                .orElseGet(() -> {
                    log.warn("Framework vendor not found with ID: {} for update", id);
                    return ResponseEntity.notFound().build();
                });
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        log.info("Deleting framework vendor with ID: {}", id);
        return repository.findById(id)
                .map(existing -> {
                    repository.delete(existing);
                    log.debug("Framework vendor deleted successfully with ID: {}", id);
                    return ResponseEntity.noContent().<Void>build();
                })
                .orElseGet(() -> {
                    log.warn("Framework vendor not found with ID: {} for deletion", id);
                    return ResponseEntity.notFound().build();
                });
    }
}
