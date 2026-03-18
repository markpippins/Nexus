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
@RequestMapping("/api/v0/server-types")
@CrossOrigin(origins = "*")
@SuppressWarnings("null")
public class ServerTypeControllerV0 {

    private static final Logger log = LoggerFactory.getLogger(ServerTypeControllerV0.class);

    @Autowired
    private ServerTypeRepository repository;

    @GetMapping
    public List<ServerType> getAll() {
        log.info("Fetching all server types");
        List<ServerType> serverTypes = repository.findAll();
        log.debug("Fetched {} server types", serverTypes.size());
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
    public ServerType create(@RequestBody ServerType serverType) {
        log.info("Creating new server type: {}", serverType.getName());
        ServerType saved = repository.save(serverType);
        log.debug("Created server type with id: {}", saved.getId());
        return saved;
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
