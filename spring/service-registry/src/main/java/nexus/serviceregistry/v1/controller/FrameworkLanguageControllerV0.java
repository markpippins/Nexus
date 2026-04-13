package nexus.serviceregistry.v1.controller;

import java.util.List;

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

import nexus.serviceregistry.v1.entity.FrameworkLanguage;
import nexus.serviceregistry.v1.repository.FrameworkLanguageRepository;

@RestController
@RequestMapping("/api/v0/framework-languages")
@CrossOrigin(origins = "*")
@SuppressWarnings("null")
@Deprecated(since = "v1", forRemoval = true)
public class FrameworkLanguageControllerV0 {

    private static final Logger log = LoggerFactory.getLogger(FrameworkLanguageControllerV0.class);

    private final FrameworkLanguageRepository repository;

    public FrameworkLanguageControllerV0(FrameworkLanguageRepository repository) {
        this.repository = repository;
    }

    @GetMapping
    @Deprecated(since = "v1", forRemoval = true)
    public List<FrameworkLanguage> getAll() {
        log.info("Fetching all framework languages");
        List<FrameworkLanguage> languages = repository.findAll();
        log.debug("Fetched {} framework languages", languages.size());
        return languages;
    }

    @GetMapping("/{id}")
    @Deprecated(since = "v1", forRemoval = true)
    public ResponseEntity<FrameworkLanguage> getById(@PathVariable Long id) {
        log.info("Fetching framework language by ID: {}", id);
        return repository.findById(id)
                .map(language -> {
                    log.debug("Framework language found with ID: {}", id);
                    return ResponseEntity.ok(language);
                })
                .orElseGet(() -> {
                    log.warn("Framework language not found with ID: {}", id);
                    return ResponseEntity.notFound().build();
                });
    }

    @PostMapping
    @Deprecated(since = "v1", forRemoval = true)
    public FrameworkLanguage create(@RequestBody FrameworkLanguage language) {
        log.info("Creating framework language: {}", language.getName());
        try {
            FrameworkLanguage saved = repository.save(language);
            log.debug("Framework language created successfully with ID: {}", saved.getId());
            return saved;
        } catch (Exception e) {
            log.error("Error creating framework language: {}", language.getName(), e);
            throw e;
        }
    }

    @PutMapping("/{id}")
    @Deprecated(since = "v1", forRemoval = true)
    public ResponseEntity<FrameworkLanguage> update(@PathVariable Long id, @RequestBody FrameworkLanguage details) {
        log.info("Updating framework language with ID: {}", id);
        return repository.findById(id)
                .map(existing -> {
                    existing.setName(details.getName());
                    existing.setDescription(details.getDescription());
                    FrameworkLanguage updated = repository.save(existing);
                    log.debug("Framework language updated successfully with ID: {}", updated.getId());
                    return ResponseEntity.ok(updated);
                })
                .orElseGet(() -> {
                    log.warn("Framework language not found with ID: {} for update", id);
                    return ResponseEntity.notFound().build();
                });
    }

    @DeleteMapping("/{id}")
    @Deprecated(since = "v1", forRemoval = true)
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        log.info("Deleting framework language with ID: {}", id);
        return repository.findById(id)
                .map(existing -> {
                    repository.delete(existing);
                    log.debug("Framework language deleted successfully with ID: {}", id);
                    return ResponseEntity.noContent().<Void>build();
                })
                .orElseGet(() -> {
                    log.warn("Framework language not found with ID: {} for deletion", id);
                    return ResponseEntity.notFound().build();
                });
    }
}
