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
import com.angrysurfer.spring.nexus.entity.Host;
import com.angrysurfer.spring.nexus.repository.HostRepository;

@RestController
@RequestMapping("/api/v1/servers")
@CrossOrigin(origins = "*")
public class HostController {

    private static final Logger log = LoggerFactory.getLogger(HostController.class);
    private final ServicesConsoleClient client;
    private final HostRepository hostRepository;

    public HostController(ServicesConsoleClient client, HostRepository hostRepository) {
        this.client = client;
        this.hostRepository = hostRepository;
    }

    @GetMapping
    public ResponseEntity<?> getServers(
            @RequestParam(required = false) String hostname,
            org.springframework.data.domain.Pageable pageable) {
        if (hostname != null) {
            log.info("Fetching server by hostname: {}", hostname);
            return hostRepository.findByHostname(hostname)
                    .map(ResponseEntity::ok)
                    .orElse(ResponseEntity.notFound().build());
        } else {
            log.info("Fetching all hosts/servers from database");
            return ResponseEntity.ok(new com.angrysurfer.spring.nexus.dto.PagedResponse<>(hostRepository.findAll(pageable)));
        }
    }

    @GetMapping("/{id}")
    public ResponseEntity<Host> getServerById(@PathVariable Long id) {
        log.info("Fetching server by ID: {}", id);
        return hostRepository.findById(id)
                .map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }

    @PostMapping
    public ResponseEntity<Host> createServer(@RequestBody Host host) {
        log.info("Creating new server: {}", host.getHostname());

        // Validate that hostname is unique
        if (hostRepository.findByHostname(host.getHostname()).isPresent()) {
            log.warn("Server with hostname {} already exists", host.getHostname());
            return ResponseEntity.badRequest().build();
        }

        // Set active flag
        host.setActiveFlag(true);

        Host savedHost = hostRepository.save(host);
        log.info("Successfully created server with ID: {}", savedHost.getId());
        java.net.URI location = org.springframework.web.servlet.support.ServletUriComponentsBuilder
                .fromCurrentRequest()
                .path("/{id}")
                .buildAndExpand(savedHost.getId())
                .toUri();
        return ResponseEntity.created(location).body(savedHost);
    }

    @PutMapping("/{id}")
    public ResponseEntity<Host> updateServer(@PathVariable Long id, @RequestBody Host host) {
        log.info("Updating server with ID: {}", id);

        Optional<Host> existingHostOpt = hostRepository.findById(id);
        if (existingHostOpt.isEmpty()) {
            log.warn("Server with ID {} not found", id);
            return ResponseEntity.notFound().build();
        }

        // Check if hostname is being changed and if new hostname already exists
        Host existingHost = existingHostOpt.get();
        if (!existingHost.getHostname().equals(host.getHostname())) {
            if (hostRepository.findByHostname(host.getHostname()).isPresent()) {
                log.warn("Server with hostname {} already exists", host.getHostname());
                return ResponseEntity.badRequest().build();
            }
        }

        // Update the server
        host.setId(id);
        Host updatedHost = hostRepository.save(host);
        log.info("Successfully updated server with ID: {}", id);
        return ResponseEntity.ok(updatedHost);
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> deleteServer(@PathVariable Long id) {
        log.info("Deleting server with ID: {}", id);

        Optional<Host> hostOpt = hostRepository.findById(id);
        if (hostOpt.isEmpty()) {
            log.warn("Server with ID {} not found", id);
            return ResponseEntity.notFound().build();
        }

        // TODO: Check if server has deployments before deleting
        // For now, just delete
        hostRepository.deleteById(id);
        log.info("Successfully deleted server with ID: {}", id);
        return ResponseEntity.noContent().build();
    }
}
