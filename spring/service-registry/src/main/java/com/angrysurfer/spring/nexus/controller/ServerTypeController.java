package com.angrysurfer.spring.nexus.controller;

import com.angrysurfer.spring.nexus.entity.ServerType;
import com.angrysurfer.spring.nexus.repository.ServerTypeRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/v1/server-types")
@CrossOrigin(origins = "*")
@SuppressWarnings("null")
public class ServerTypeController {

    private static final Logger log = LoggerFactory.getLogger(ServerTypeController.class);

    @Autowired
    private ServerTypeRepository repository;

    @GetMapping
    public org.springframework.data.domain.Page<ServerType> getAll(org.springframework.data.domain.Pageable pageable) {
        log.info("Fetching all server types");
        org.springframework.data.domain.Page<ServerType> serverTypes = repository.findAll(pageable);
        log.debug("Fetched {} server types", serverTypes.getNumberOfElements());
        return serverTypes;
    }

    @GetMapping("/{id}")
    public ResponseEntity<ServerType> getById(@PathVariable Long id) {
        log.info("Fetching server type with id: {}", id);
        return repository.findById(id)
                .map(serverType -> {
                    log.debug("Found server type: {}", serverType.getName());
                    return ResponseEntity.ok(serverType);
                })
                .orElseGet(() -> {
                    log.warn("Server type not found with id: {}", id);
                    return ResponseEntity.notFound().build();
                });
    }

    @PostMapping
    public ResponseEntity<ServerType> create(@RequestBody ServerType serverType) {
        log.info("Creating new server type: {}", serverType.getName());
        ServerType saved = repository.save(serverType);
        log.debug("Created server type with id: {}", saved.getId());
        java.net.URI location = org.springframework.web.servlet.support.ServletUriComponentsBuilder
                .fromCurrentRequest()
                .path("/{id}")
                .buildAndExpand(saved.getId())
                .toUri();
        return ResponseEntity.created(location).body(saved);
    }

    @PutMapping("/{id}")
    public ResponseEntity<ServerType> update(@PathVariable Long id, @RequestBody ServerType details) {
        log.info("Updating server type with id: {}", id);
        return repository.findById(id)
                .map(existing -> {
                    existing.setName(details.getName());
                    existing.setDescription(details.getDescription());
                    ServerType updated = repository.save(existing);
                    log.debug("Updated server type: {}", updated.getName());
                    return ResponseEntity.ok(updated);
                })
                .orElseGet(() -> {
                    log.warn("Server type not found for update with id: {}", id);
                    return ResponseEntity.notFound().build();
                });
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        log.info("Deleting server type with id: {}", id);
        return repository.findById(id)
                .map(existing -> {
                    repository.delete(existing);
                    log.debug("Deleted server type: {}", existing.getName());
                    return ResponseEntity.noContent().<Void>build();
                })
                .orElseGet(() -> {
                    log.warn("Server type not found for deletion with id: {}", id);
                    return ResponseEntity.notFound().build();
                });
    }
}
