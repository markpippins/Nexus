package com.aibizarchitect.nexus.v1.spring.topology.controller;

import com.aibizarchitect.nexus.v1.spring.topology.dto.SpringPagedResponse;
import com.aibizarchitect.nexus.v1.spring.topology.entity.ServiceDependency;
import com.aibizarchitect.nexus.v1.spring.topology.repository.ServiceDependencyRepository;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.data.web.PageableDefault;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/v1/service-dependencies")
@CrossOrigin(origins = "*")
public class ServiceDependencyController {

    private final ServiceDependencyRepository repository;

    public ServiceDependencyController(ServiceDependencyRepository repository) {
        this.repository = repository;
    }

    @GetMapping
    public ResponseEntity<Map<String, Object>> getAll(
            @PageableDefault(sort = "id", direction = Sort.Direction.ASC, size = 200) Pageable pageable) {
        return ResponseEntity.ok(SpringPagedResponse.fromPage(repository.findAll(pageable)));
    }

    @GetMapping("/{id}")
    public ResponseEntity<ServiceDependency> getById(@PathVariable Long id) {
        return repository.findById(id)
                .map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }

    /** Get all dependencies where the given source consumes the target */
    @GetMapping("/by-source")
    public ResponseEntity<List<ServiceDependency>> getBySource(
            @RequestParam String sourceType, @RequestParam Long sourceId) {
        return ResponseEntity.ok(repository.findBySourceTypeAndSourceId(sourceType, sourceId));
    }

    /** Get all dependencies where the given target is consumed */
    @GetMapping("/by-target")
    public ResponseEntity<List<ServiceDependency>> getByTarget(
            @RequestParam String targetType, @RequestParam Long targetId) {
        return ResponseEntity.ok(repository.findByTargetTypeAndTargetId(targetType, targetId));
    }

    @PostMapping
    public ServiceDependency create(@RequestBody ServiceDependency dep) {
        return repository.save(dep);
    }

    @PutMapping("/{id}")
    public ResponseEntity<ServiceDependency> update(@PathVariable Long id, @RequestBody ServiceDependency details) {
        return repository.findById(id)
                .map(existing -> {
                    existing.setSourceType(details.getSourceType());
                    existing.setSourceId(details.getSourceId());
                    existing.setTargetType(details.getTargetType());
                    existing.setTargetId(details.getTargetId());
                    existing.setCriticality(details.getCriticality());
                    existing.setDescription(details.getDescription());
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
