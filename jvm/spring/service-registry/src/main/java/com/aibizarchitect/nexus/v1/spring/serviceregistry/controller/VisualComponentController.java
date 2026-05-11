package com.aibizarchitect.nexus.v1.spring.serviceregistry.controller;

import com.aibizarchitect.nexus.v1.spring.serviceregistry.entity.VisualComponent;
import com.aibizarchitect.nexus.v1.spring.serviceregistry.repository.VisualComponentRepository;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import java.util.List;

@RestController
@RequestMapping("/api/v1/visual-components")
@CrossOrigin(origins = "*")
public class VisualComponentController {

    private final VisualComponentRepository repository;

    public VisualComponentController(VisualComponentRepository repository) {
        this.repository = repository;
    }

    @GetMapping
    public ResponseEntity<com.aibizarchitect.nexus.v1.dto.PagedResponse<VisualComponent>> getAll(org.springframework.data.domain.Pageable pageable) {
        return ResponseEntity.ok(com.aibizarchitect.nexus.v1.spring.serviceregistry.dto.SpringPagedResponse.fromPage(repository.findAll(pageable)));
    }

    @GetMapping("/{id}")
    public ResponseEntity<VisualComponent> getById(@PathVariable Long id) {
        return repository.findById(id)
                .map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }

    @PostMapping
    public VisualComponent create(@RequestBody VisualComponent component) {
        return repository.save(component);
    }

    @PutMapping("/{id}")
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
