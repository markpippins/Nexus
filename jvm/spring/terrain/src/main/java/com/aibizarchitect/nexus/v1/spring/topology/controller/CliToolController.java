package com.aibizarchitect.nexus.v1.spring.topology.controller;

import com.aibizarchitect.nexus.v1.spring.topology.dto.SpringPagedResponse;
import com.aibizarchitect.nexus.v1.spring.topology.entity.CliTool;
import com.aibizarchitect.nexus.v1.spring.topology.repository.CliToolRepository;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.data.web.PageableDefault;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/v1/cli-tools")
@CrossOrigin(origins = "*")
public class CliToolController {

    private final CliToolRepository repository;

    public CliToolController(CliToolRepository repository) {
        this.repository = repository;
    }

    @GetMapping
    public ResponseEntity<Map<String, Object>> getAll(
            @PageableDefault(sort = "name", direction = Sort.Direction.ASC, size = 200) Pageable pageable) {
        return ResponseEntity.ok(SpringPagedResponse.fromPage(repository.findAll(pageable)));
    }

    @GetMapping("/{id}")
    public ResponseEntity<CliTool> getById(@PathVariable Long id) {
        return repository.findById(id)
                .map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }

    @PostMapping
    public CliTool create(@RequestBody CliTool tool) {
        return repository.save(tool);
    }

    @PutMapping("/{id}")
    public ResponseEntity<CliTool> update(@PathVariable Long id, @RequestBody CliTool details) {
        return repository.findById(id)
                .map(existing -> {
                    existing.setName(details.getName());
                    existing.setToolPath(details.getToolPath());
                    existing.setDescription(details.getDescription());
                    existing.setInvocation(details.getInvocation());
                    existing.setLanguage(details.getLanguage());
                    existing.setCategory(details.getCategory());
                    existing.setStartup(details.getStartup());
                    existing.setStartupScript(details.getStartupScript());
                    existing.setBuildCommand(details.getBuildCommand());
                    existing.setHealth(details.getHealth());
                    existing.setSysUser(details.getSysUser());
                    existing.setSysPass(details.getSysPass());
                    existing.setNotes(details.getNotes());
                    existing.setIsInternal(details.getIsInternal());
                    existing.setActiveFlag(details.getActiveFlag());
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
