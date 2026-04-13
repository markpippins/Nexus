package nexus.serviceregistry.v1.controller;

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
import org.springframework.web.bind.annotation.RestController;

import nexus.serviceregistry.v1.client.ServicesConsoleClient;
import nexus.serviceregistry.v1.entity.Framework;
import nexus.serviceregistry.v1.repository.FrameworkRepository;

@RestController
@RequestMapping("/api/v0/frameworks")
@CrossOrigin(origins = "*")
@Deprecated(since = "v1", forRemoval = true)
public class FrameworkControllerV0 {

    private static final Logger log = LoggerFactory.getLogger(FrameworkControllerV0.class);

    private final ServicesConsoleClient client;
    private final FrameworkRepository frameworkRepository;

    public FrameworkControllerV0(ServicesConsoleClient client, FrameworkRepository frameworkRepository) {
        this.client = client;
        this.frameworkRepository = frameworkRepository;
    }

    @GetMapping
    @Deprecated(since = "v1", forRemoval = true)
    public List<Framework> getAllFrameworks() {
        log.info("Fetching all frameworks from database");
        return frameworkRepository.findAll();
    }

    @GetMapping("/all")
    @Deprecated(since = "v1", forRemoval = true)
    public List<Framework> getAllFrameworksExplicit() {
        log.info("Fetching ALL frameworks from database (explicit)");
        return frameworkRepository.findAll();
    }

    @GetMapping("/{id}")
    @Deprecated(since = "v1", forRemoval = true)
    public ResponseEntity<Framework> getFrameworkById(@PathVariable Long id) {
        log.info("Fetching framework by ID: {}", id);
        Optional<Framework> framework = frameworkRepository.findById(id);
        return framework.map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }

    @GetMapping("/name/{name}")
    @Deprecated(since = "v1", forRemoval = true)
    public ResponseEntity<Framework> getFrameworkByName(@PathVariable String name) {
        log.info("Fetching framework by name: {}", name);
        Optional<Framework> framework = frameworkRepository.findByName(name);
        return framework.map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }

    @GetMapping("/broker-compatible")
    @Deprecated(since = "v1", forRemoval = true)
    public List<Framework> getBrokerCompatibleFrameworks() {
        // Filter frameworks that support broker pattern
        return frameworkRepository.findAll().stream()
                .filter(framework -> framework.getSupportsBrokerPattern() != null
                        && framework.getSupportsBrokerPattern())
                .toList();
    }

    @PostMapping
    @Deprecated(since = "v1", forRemoval = true)
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
        return ResponseEntity.ok(savedFramework);
    }

    @PutMapping("/{id}")
    @Deprecated(since = "v1", forRemoval = true)
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
    @Deprecated(since = "v1", forRemoval = true)
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
