package com.aibizarchitect.nexus.v1.spring.atlas.controller;

import com.aibizarchitect.nexus.v1.spring.atlas.entity.GraphView;
import com.aibizarchitect.nexus.v1.spring.atlas.entity.GraphViewPosition;
import com.aibizarchitect.nexus.v1.spring.atlas.repository.GraphViewPositionRepository;
import com.aibizarchitect.nexus.v1.spring.atlas.repository.GraphViewRepository;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.data.web.PageableDefault;
import org.springframework.http.ResponseEntity;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.util.ArrayList;
import java.util.List;

@RestController
@RequestMapping("/api/v1/graph-views")
@CrossOrigin(origins = "*")
public class GraphViewController {

    private final GraphViewRepository repository;
    private final GraphViewPositionRepository positionRepository;

    public GraphViewController(GraphViewRepository repository, GraphViewPositionRepository positionRepository) {
        this.repository = repository;
        this.positionRepository = positionRepository;
    }

    /** List all views (positions are lazy — loaded on demand). */
    @GetMapping
    public ResponseEntity<List<GraphView>> getAll(
            @PageableDefault(sort = "name", direction = Sort.Direction.ASC, size = 200) Pageable pageable) {
        return ResponseEntity.ok(repository.findAll(pageable).getContent());
    }

    /** Get a single view with its positions eager-loaded via EntityGraph. */
    @GetMapping("/{id}")
    public ResponseEntity<GraphView> getById(@PathVariable("id") Long id) {
        return repository.findWithPositionsById(id)
                .map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }

    /** Create a new view with optional positions. */
    @PostMapping
    @Transactional
    public GraphView create(@RequestBody GraphView view) {
        // Wire up the bidirectional relationship
        if (view.getPositions() != null) {
            for (GraphViewPosition pos : view.getPositions()) {
                pos.setGraphView(view);
            }
        }
        // If this is the first view, make it default
        if (view.getIsDefault() != null && view.getIsDefault()) {
            repository.clearDefault();
        } else if (repository.count() == 0) {
            view.setIsDefault(true);
        }
        return repository.save(view);
    }

    /** Update an existing view (replaces positions entirely). */
    @PutMapping("/{id}")
    @Transactional
    public ResponseEntity<GraphView> update(@PathVariable("id") Long id, @RequestBody GraphView details) {
        return repository.findById(id)
                .map(existing -> {
                    existing.setName(details.getName());
                    existing.setDescription(details.getDescription());
                    existing.setCameraPositionX(details.getCameraPositionX());
                    existing.setCameraPositionY(details.getCameraPositionY());
                    existing.setCameraPositionZ(details.getCameraPositionZ());
                    existing.setCameraTargetX(details.getCameraTargetX());
                    existing.setCameraTargetY(details.getCameraTargetY());
                    existing.setCameraTargetZ(details.getCameraTargetZ());

                    // Camera 2 (secondary viewpoint)
                    existing.setCamera2PositionX(details.getCamera2PositionX());
                    existing.setCamera2PositionY(details.getCamera2PositionY());
                    existing.setCamera2PositionZ(details.getCamera2PositionZ());
                    existing.setCamera2TargetX(details.getCamera2TargetX());
                    existing.setCamera2TargetY(details.getCamera2TargetY());
                    existing.setCamera2TargetZ(details.getCamera2TargetZ());

                    // Connections (JSON string stored in JSONB column)
                    existing.setConnections(details.getConnections());

                    // Replace positions (only if explicitly provided)
                    if (details.getPositions() != null) {
                        // HACK: Hibernate flushes INSERT before DELETE, which violates the
                        // unique (graph_view_id, node_id) constraint when clear()+add() is
                        // used with orphanRemoval=true. Explicitly delete positions via a
                        // @Modifying JPQL query that executes immediately, then clear the
                        // managed collection to keep the entity graph consistent.
                        positionRepository.deleteByGraphViewId(existing.getId());
                        existing.getPositions().clear();
                        for (GraphViewPosition pos : details.getPositions()) {
                            pos.setId(null); // ensure treated as new, not detached
                            pos.setGraphView(existing);
                            existing.getPositions().add(pos);
                        }
                    }

                    // Return the managed entity directly — @Transactional auto-flushes.
                    return ResponseEntity.ok(existing);
                })
                .orElse(ResponseEntity.notFound().build());
    }

    /** Delete a view (cascades to positions). */
    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable("id") Long id) {
        return repository.findById(id)
                .map(existing -> {
                    repository.delete(existing);
                    return ResponseEntity.ok().<Void>build();
                })
                .orElse(ResponseEntity.notFound().build());
    }

    /** Set a view as the default (clears all other defaults first). */
    @PutMapping("/{id}/set-default")
    @Transactional
    public ResponseEntity<GraphView> setDefault(@PathVariable("id") Long id) {
        return repository.findById(id)
                .map(view -> {
                    repository.clearDefault();
                    view.setIsDefault(true);
                    return ResponseEntity.ok(repository.save(view));
                })
                .orElse(ResponseEntity.notFound().build());
    }
}
