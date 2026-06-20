package com.aibizarchitect.nexus.v1.spring.topology.controller;

import com.aibizarchitect.nexus.v1.spring.topology.dto.SpringPagedResponse;
import com.aibizarchitect.nexus.v1.spring.topology.entity.McpServer;
import com.aibizarchitect.nexus.v1.spring.topology.repository.McpServerRepository;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.data.web.PageableDefault;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/v1/mcp-servers")
@CrossOrigin(origins = "*")
public class McpServerController {

    private final McpServerRepository repository;

    public McpServerController(McpServerRepository repository) {
        this.repository = repository;
    }

    @GetMapping
    public ResponseEntity<Map<String, Object>> getAll(
            @PageableDefault(sort = "name", direction = Sort.Direction.ASC, size = 200) Pageable pageable) {
        return ResponseEntity.ok(SpringPagedResponse.fromPage(repository.findAll(pageable)));
    }

    @GetMapping("/{id}")
    public ResponseEntity<McpServer> getById(@PathVariable Long id) {
        return repository.findById(id)
                .map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }

    @PostMapping
    public McpServer create(@RequestBody McpServer server) {
        return repository.save(server);
    }

    @PutMapping("/{id}")
    public ResponseEntity<McpServer> update(@PathVariable Long id, @RequestBody McpServer details) {
        return repository.findById(id)
                .map(existing -> {
                    existing.setName(details.getName());
                    existing.setPort(details.getPort());
                    existing.setWorkspacePath(details.getWorkspacePath());
                    existing.setServiceTypeId(details.getServiceTypeId());
                    existing.setHealthCheckUrl(details.getHealthCheckUrl());
                    existing.setStatus(details.getStatus());
                    existing.setTransportType(details.getTransportType());
                    existing.setVersion(details.getVersion());
                    existing.setDescription(details.getDescription());
                    existing.setRepositoryUrl(details.getRepositoryUrl());
                    existing.setActiveFlag(details.getActiveFlag());
                    existing.setStartup(details.getStartup());
                    existing.setStartupScript(details.getStartupScript());
                    existing.setBuildCommand(details.getBuildCommand());
                    existing.setHealth(details.getHealth());
                    existing.setSysUser(details.getSysUser());
                    existing.setSystemPass(details.getSystemPass());
                    existing.setNotes(details.getNotes());
                    existing.setIsInternal(details.getIsInternal());
                    return ResponseEntity.ok(repository.save(existing));
                })
                .orElse(ResponseEntity.notFound().build());
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        return repository.findById(id)
                .map(existing -> {
                    repository.delete(existing);
                    return ResponseEntity.ok().<Void>build();
                })
                .orElse(ResponseEntity.notFound().build());
    }
}
