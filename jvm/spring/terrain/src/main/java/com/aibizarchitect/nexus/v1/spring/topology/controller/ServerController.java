package com.aibizarchitect.nexus.v1.spring.topology.controller;

import com.aibizarchitect.nexus.v1.spring.topology.dto.SpringPagedResponse;
import com.aibizarchitect.nexus.v1.spring.topology.entity.Server;
import com.aibizarchitect.nexus.v1.spring.topology.repository.ServerRepository;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.data.web.PageableDefault;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/v1/servers")
@CrossOrigin(origins = "*")
public class ServerController {

    private final ServerRepository repository;

    public ServerController(ServerRepository repository) {
        this.repository = repository;
    }

    @GetMapping
    public ResponseEntity<Map<String, Object>> getAll(
            @PageableDefault(sort = "hostname", direction = Sort.Direction.ASC, size = 200) Pageable pageable) {
        return ResponseEntity.ok(SpringPagedResponse.fromPage(repository.findAll(pageable)));
    }

    @GetMapping("/{id}")
    public ResponseEntity<Server> getById(@PathVariable Long id) {
        return repository.findById(id)
                .map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }

    @PostMapping
    public Server create(@RequestBody Server server) {
        return repository.save(server);
    }

    @PutMapping("/{id}")
    public ResponseEntity<Server> update(@PathVariable Long id, @RequestBody Server details) {
        return repository.findById(id)
                .map(existing -> {
                    existing.setHostname(details.getHostname());
                    existing.setIpAddress(details.getIpAddress());
                    existing.setOs(details.getOs());
                    existing.setStatus(details.getStatus());
                    existing.setActiveFlag(details.getActiveFlag());
                    existing.setStartup(details.getStartup());
                    existing.setStartupScript(details.getStartupScript());
                    existing.setBuildCommand(details.getBuildCommand());
                    existing.setHealth(details.getHealth());
                    existing.setSysUser(details.getSysUser());
                    existing.setSysPass(details.getSysPass());
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
