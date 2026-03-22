package com.angrysurfer.spring.nexus.controller;

import com.angrysurfer.spring.nexus.entity.VisualComponent;
import com.angrysurfer.spring.nexus.repository.VisualComponentRepository;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import java.util.List;

@RestController
@RequestMapping("/api/v0/visual-components")
@CrossOrigin(origins = "*")
@Deprecated(since = "v1", forRemoval = true)
public class VisualComponentControllerV0 {

    private final VisualComponentRepository repository;

    public VisualComponentControllerV0(VisualComponentRepository repository) {
        this.repository = repository;
    }

    @GetMapping
    @Deprecated(since = "v1", forRemoval = true)
    public List<VisualComponent> getAll() {
        return repository.findAll();
    }

    @GetMapping("/{id}")
    @Deprecated(since = "v1", forRemoval = true)
    public ResponseEntity<VisualComponent> getById(@PathVariable Long id) {
        return repository.findById(id)
                .map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }

    @PostMapping
    @Deprecated(since = "v1", forRemoval = true)
    public VisualComponent create(@RequestBody VisualComponent component) {
        return repository.save(component);
    }

    @PutMapping("/{id}")
    @Deprecated(since = "v1", forRemoval = true)
    public ResponseEntity<VisualComponent> update(@PathVariable Long id, @RequestBody VisualComponent details) {
        return repository.findById(id)
                .map(existing -> {
                    if (existing.getIsSystem()) {
                        return ResponseEntity.status(403).<VisualComponent>build(); // Prevent editing system components
                    }
                    existing.setName(details.getName());
                    existing.setGeometry(details.getGeometry());
                    existing.setDefaultColor(details.getDefaultColor());
                    existing.setScale(details.getScale());
                    existing.setIconClass(details.getIconClass());
                    existing.setColorClass(details.getColorClass());
                    existing.setDescription(details.getDescription());
                    return ResponseEntity.ok(repository.save(existing));
                })
                .orElse(ResponseEntity.notFound().build());
    }

    @DeleteMapping("/{id}")
    @Deprecated(since = "v1", forRemoval = true)
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        return repository.findById(id)
                .map(existing -> {
                    if (existing.getIsSystem()) {
                        return ResponseEntity.status(403).<Void>build();
                    }
                    repository.delete(existing);
                    return ResponseEntity.ok().<Void>build();
                })
                .orElse(ResponseEntity.notFound().build());
    }
}
