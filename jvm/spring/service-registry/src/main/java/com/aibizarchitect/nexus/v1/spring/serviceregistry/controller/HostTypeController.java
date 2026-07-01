package com.aibizarchitect.nexus.v1.spring.serviceregistry.controller;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.aibizarchitect.nexus.v1.spring.serviceregistry.entity.HostType;
import com.aibizarchitect.nexus.v1.spring.serviceregistry.repository.HostTypeRepository;

@RestController
@RequestMapping("/api/v1/host-types")
@CrossOrigin(origins = "*")
@SuppressWarnings("null")
public class HostTypeController {

    private static final Logger log = LoggerFactory.getLogger(HostTypeController.class);

    private final HostTypeRepository repository;

    public HostTypeController(HostTypeRepository repository) {
        this.repository = repository;
    }

    @GetMapping
    public ResponseEntity<com.aibizarchitect.nexus.v1.dto.PagedResponse<HostType>> getAll(org.springframework.data.domain.Pageable pageable) {
        log.info("Fetching all host types");
        org.springframework.data.domain.Page<HostType> hostTypes = repository.findAll(pageable);
        log.debug("Fetched {} host types", hostTypes.getNumberOfElements());
        return ResponseEntity.ok(com.aibizarchitect.nexus.v1.spring.serviceregistry.dto.SpringPagedResponse.fromPage(hostTypes));
    }

    @GetMapping("/{id}")
    public ResponseEntity<HostType> getById(@PathVariable Long id) {
        log.info("Fetching host type with id: {}", id);
        return repository.findById(id)
                .map(hostType -> {
                    log.debug("Found host type: {}", hostType.getName());
                    return ResponseEntity.ok(hostType);
                })
                .orElseGet(() -> {
                    log.warn("Host type not found with id: {}", id);
                    return ResponseEntity.notFound().build();
                });
    }

    @PostMapping
    public ResponseEntity<HostType> create(@RequestBody HostType hostType) {
        log.info("Creating new host type: {}", hostType.getName());
        HostType saved = repository.save(hostType);
        log.debug("Created host type with id: {}", saved.getId());
        java.net.URI location = org.springframework.web.servlet.support.ServletUriComponentsBuilder
                .fromCurrentRequest()
                .path("/{id}")
                .buildAndExpand(saved.getId())
                .toUri();
        return ResponseEntity.created(location).body(saved);
    }

    @PutMapping("/{id}")
    public ResponseEntity<HostType> update(@PathVariable Long id, @RequestBody HostType details) {
        log.info("Updating host type with id: {}", id);
        return repository.findById(id)
                .map(existing -> {
                    existing.setName(details.getName());
                    existing.setDescription(details.getDescription());
                    HostType updated = repository.save(existing);
                    log.debug("Updated host type: {}", updated.getName());
                    return ResponseEntity.ok(updated);
                })
                .orElseGet(() -> {
                    log.warn("Host type not found for update with id: {}", id);
                    return ResponseEntity.notFound().build();
                });
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        log.info("Deleting host type with id: {}", id);
        return repository.findById(id)
                .map(existing -> {
                    repository.delete(existing);
                    log.debug("Deleted host type: {}", existing.getName());
                    return ResponseEntity.noContent().<Void>build();
                })
                .orElseGet(() -> {
                    log.warn("Host type not found for deletion with id: {}", id);
                    return ResponseEntity.notFound().build();
                });
    }
}
