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
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.aibizarchitect.nexus.v1.spring.serviceregistry.client.ServicesConsoleClient;
import com.aibizarchitect.nexus.v1.spring.serviceregistry.entity.Server;
import com.aibizarchitect.nexus.v1.spring.serviceregistry.repository.ServerRepository;

@RestController
@RequestMapping("/api/v1/servers")
@CrossOrigin(origins = "*")
public class ServerController {

    private static final Logger log = LoggerFactory.getLogger(ServerController.class);
    private final ServicesConsoleClient client;
    private final ServerRepository serverRepository;

    public ServerController(ServicesConsoleClient client, ServerRepository serverRepository) {
        this.client = client;
        this.serverRepository = serverRepository;
    }

    @GetMapping
    public ResponseEntity<?> getServers(
            @RequestParam(required = false) String hostname,
            org.springframework.data.domain.Pageable pageable) {
        if (hostname != null) {
            log.info("Fetching server by hostname: {}", hostname);
            return serverRepository.findByHostname(hostname)
                    .map(ResponseEntity::ok)
                    .orElse(ResponseEntity.notFound().build());
        } else {
            log.info("Fetching all servers from database");
            return ResponseEntity.ok(com.aibizarchitect.nexus.v1.spring.serviceregistry.dto.SpringPagedResponse.fromPage(serverRepository.findAll(pageable)));
        }
    }

    @GetMapping("/{id}")
    public ResponseEntity<Server> getServerById(@PathVariable Long id) {
        log.info("Fetching server by ID: {}", id);
        return serverRepository.findById(id)
                .map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }

    @PostMapping
    public ResponseEntity<Server> createServer(@RequestBody Server server) {
        log.info("Creating new server: {}", server.getHostname());

        // Validate that hostname is unique
        if (serverRepository.findByHostname(server.getHostname()).isPresent()) {
            log.warn("Server with hostname {} already exists", server.getHostname());
            return ResponseEntity.badRequest().build();
        }

        // Set active flag
        server.setActiveFlag(true);

        Server savedServer = serverRepository.save(server);
        log.info("Successfully created server with ID: {}", savedServer.getId());
        java.net.URI location = org.springframework.web.servlet.support.ServletUriComponentsBuilder
                .fromCurrentRequest()
                .path("/{id}")
                .buildAndExpand(savedServer.getId())
                .toUri();
        return ResponseEntity.created(location).body(savedServer);
    }

    @PutMapping("/{id}")
    public ResponseEntity<Server> updateServer(@PathVariable Long id, @RequestBody Server server) {
        log.info("Updating server with ID: {}", id);

        Optional<Server> existingServerOpt = serverRepository.findById(id);
        if (existingServerOpt.isEmpty()) {
            log.warn("Server with ID {} not found", id);
            return ResponseEntity.notFound().build();
        }

        // Check if hostname is being changed and if new hostname already exists
        Server existingServer = existingServerOpt.get();
        if (!existingServer.getHostname().equals(server.getHostname())) {
            if (serverRepository.findByHostname(server.getHostname()).isPresent()) {
                log.warn("Server with hostname {} already exists", server.getHostname());
                return ResponseEntity.badRequest().build();
            }
        }

        // Update the server
        server.setId(id);
        Server updatedServer = serverRepository.save(server);
        log.info("Successfully updated server with ID: {}", id);
        return ResponseEntity.ok(updatedServer);
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> deleteServer(@PathVariable Long id) {
        log.info("Deleting server with ID: {}", id);

        Optional<Server> serverOpt = serverRepository.findById(id);
        if (serverOpt.isEmpty()) {
            log.warn("Server with ID {} not found", id);
            return ResponseEntity.notFound().build();
        }

        serverRepository.deleteById(id);
        log.info("Successfully deleted server with ID: {}", id);
        return ResponseEntity.noContent().build();
    }
}
