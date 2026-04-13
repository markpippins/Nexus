package nexus.serviceregistry.v1.controller;

import nexus.serviceregistry.v1.entity.EnvironmentType;
import nexus.serviceregistry.v1.repository.EnvironmentTypeRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/environments")
@CrossOrigin(origins = "*")
@SuppressWarnings("null")
public class EnvironmentTypeController {

    private static final Logger log = LoggerFactory.getLogger(EnvironmentTypeController.class);

    private final EnvironmentTypeRepository repository;

    public EnvironmentTypeController(EnvironmentTypeRepository repository) {
        this.repository = repository;
    }

    @GetMapping
    public ResponseEntity<com.angrysurfer.nexus.dto.PagedResponse<EnvironmentType>> getAll(org.springframework.data.domain.Pageable pageable) {
        log.info("Fetching all environment types");
        org.springframework.data.domain.Page<EnvironmentType> environmentTypes = repository.findAll(pageable);
        log.debug("Fetched {} environment types", environmentTypes.getNumberOfElements());
        return ResponseEntity.ok(nexus.serviceregistry.v1.dto.SpringPagedResponse.fromPage(environmentTypes));
    }

    @GetMapping("/{id}")
    public ResponseEntity<EnvironmentType> getById(@PathVariable Long id) {
        log.info("Fetching environment type with id: {}", id);
        return repository.findById(id)
                .map(env -> {
                    log.debug("Found environment type: {}", env.getName());
                    return ResponseEntity.ok(env);
                })
                .orElseGet(() -> {
                    log.warn("Environment type not found with id: {}", id);
                    return ResponseEntity.notFound().build();
                });
    }

    @PostMapping
    public ResponseEntity<EnvironmentType> create(@RequestBody EnvironmentType environmentType) {
        log.info("Creating new environment type: {}", environmentType.getName());
        EnvironmentType saved = repository.save(environmentType);
        log.debug("Created environment type with id: {}", saved.getId());
        java.net.URI location = org.springframework.web.servlet.support.ServletUriComponentsBuilder
                .fromCurrentRequest()
                .path("/{id}")
                .buildAndExpand(saved.getId())
                .toUri();
        return ResponseEntity.created(location).body(saved);
    }

    @PutMapping("/{id}")
    public ResponseEntity<EnvironmentType> update(@PathVariable Long id, @RequestBody EnvironmentType details) {
        log.info("Updating environment type with id: {}", id);
        return repository.findById(id)
                .map(existing -> {
                    existing.setName(details.getName());
                    existing.setActiveFlag(details.getActiveFlag());
                    EnvironmentType updated = repository.save(existing);
                    log.debug("Updated environment type: {}", updated.getName());
                    return ResponseEntity.ok(updated);
                })
                .orElseGet(() -> {
                    log.warn("Environment type not found for update with id: {}", id);
                    return ResponseEntity.notFound().build();
                });
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        log.info("Deleting environment type with id: {}", id);
        return repository.findById(id)
                .map(existing -> {
                    repository.delete(existing);
                    log.debug("Deleted environment type: {}", existing.getName());
                    return ResponseEntity.noContent().<Void>build();
                })
                .orElseGet(() -> {
                    log.warn("Environment type not found for deletion with id: {}", id);
                    return ResponseEntity.notFound().build();
                });
    }
}
