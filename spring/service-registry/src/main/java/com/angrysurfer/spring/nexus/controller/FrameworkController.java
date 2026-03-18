package com.angrysurfer.spring.nexus.controller;

import java.util.List;
import java.util.Optional;

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
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.angrysurfer.spring.nexus.client.ServicesConsoleClient;
import com.angrysurfer.spring.nexus.entity.Framework;
import com.angrysurfer.spring.nexus.repository.FrameworkRepository;

@RestController
@RequestMapping("/api/v1/frameworks")
@CrossOrigin(origins = "*")
public class FrameworkController {

    private static final Logger log = LoggerFactory.getLogger(FrameworkController.class);

    private final ServicesConsoleClient client;
    private final FrameworkRepository frameworkRepository;

    public FrameworkController(ServicesConsoleClient client, FrameworkRepository frameworkRepository) {
        this.client = client;
        this.frameworkRepository = frameworkRepository;
    }

    @GetMapping
    public ResponseEntity<?> getFrameworks(
            @RequestParam(required = false) String name,
            @RequestParam(required = false) Boolean brokerCompatible,
            org.springframework.data.domain.Pageable pageable) {

        if (name != null) {
            log.info("Fetching framework by name: {}", name);
            return frameworkRepository.findByName(name)
                    .map(ResponseEntity::ok)
                    .orElse(ResponseEntity.notFound().build());
        } else if (Boolean.TRUE.equals(brokerCompatible)) {
            log.info("Fetching broker-compatible frameworks");
            List<Framework> list = frameworkRepository.findAll().stream()
                    .filter(framework -> framework.getSupportsBrokerPattern() != null
                            && framework.getSupportsBrokerPattern())
                    .toList();
            int start = (int) pageable.getOffset();
            int end = Math.min((start + pageable.getPageSize()), list.size());
            org.springframework.data.domain.Page<Framework> page = new org.springframework.data.domain.PageImpl<>(
                    (start <= end) ? list.subList(start, end) : java.util.Collections.emptyList(),
                    pageable, list.size());
            return ResponseEntity.ok(page);
        } else {
            log.info("Fetching all frameworks from database");
            return ResponseEntity.ok(frameworkRepository.findAll(pageable));
        }
    }

    @GetMapping("/{id}")
    public ResponseEntity<Framework> getFrameworkById(@PathVariable Long id) {
        log.info("Fetching framework by ID: {}", id);
        Optional<Framework> framework = frameworkRepository.findById(id);
        return framework.map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }

    @PostMapping
    public ResponseEntity<Framework> createFramework(@RequestBody Framework framework) {
        log.info("Creating new framework: {}", framework.getName());

        // Validate that framework name is unique
        if (frameworkRepository.findByName(framework.getName()).isPresent()) {
            log.warn("Framework with name {} already exists", framework.getName());
            return ResponseEntity.badRequest().build();
        }

        // Set active flag
        framework.setActiveFlag(true);

        Framework savedFramework = frameworkRepository.save(framework);
        log.info("Successfully created framework with ID: {}", savedFramework.getId());
        java.net.URI location = org.springframework.web.servlet.support.ServletUriComponentsBuilder
                .fromCurrentRequest()
                .path("/{id}")
                .buildAndExpand(savedFramework.getId())
                .toUri();
        return ResponseEntity.created(location).body(savedFramework);
    }

    @PutMapping("/{id}")
    public ResponseEntity<Framework> updateFramework(@PathVariable Long id, @RequestBody Framework framework) {
        log.info("Updating framework with ID: {}", id);

        Optional<Framework> existingFrameworkOpt = frameworkRepository.findById(id);
        if (existingFrameworkOpt.isEmpty()) {
            log.warn("Framework with ID {} not found", id);
            return ResponseEntity.notFound().build();
        }

        // Check if name is being changed and if new name already exists
        Framework existingFramework = existingFrameworkOpt.get();
        if (!existingFramework.getName().equals(framework.getName())) {
            if (frameworkRepository.findByName(framework.getName()).isPresent()) {
                log.warn("Framework with name {} already exists", framework.getName());
                return ResponseEntity.badRequest().build();
            }
        }

        // Update the framework
        framework.setId(id);
        Framework updatedFramework = frameworkRepository.save(framework);
        log.info("Successfully updated framework with ID: {}", id);
        return ResponseEntity.ok(updatedFramework);
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> deleteFramework(@PathVariable Long id) {
        log.info("Deleting framework with ID: {}", id);

        Optional<Framework> frameworkOpt = frameworkRepository.findById(id);
        if (frameworkOpt.isEmpty()) {
            log.warn("Framework with ID {} not found", id);
            return ResponseEntity.notFound().build();
        }

        // TODO: Check if framework has services before deleting
        // For now, just delete
        frameworkRepository.deleteById(id);
        log.info("Successfully deleted framework with ID: {}", id);
        return ResponseEntity.noContent().build();
    }
}
