package com.aibizarchitect.nexus.v1.spring.topology.controller;

import com.aibizarchitect.nexus.v1.spring.topology.dto.SpringPagedResponse;
import com.aibizarchitect.nexus.v1.spring.topology.entity.HostProfile;
import com.aibizarchitect.nexus.v1.spring.topology.repository.HostProfileRepository;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.data.web.PageableDefault;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/v1/host-profiles")
@CrossOrigin(origins = "*")
public class HostProfileController {

    private final HostProfileRepository repository;

    public HostProfileController(HostProfileRepository repository) {
        this.repository = repository;
    }

    @GetMapping
    public ResponseEntity<Map<String, Object>> getAll(
            @PageableDefault(sort = "name", direction = Sort.Direction.ASC, size = 200) Pageable pageable) {
        return ResponseEntity.ok(SpringPagedResponse.fromPage(repository.findAll(pageable)));
    }

    @GetMapping("/{id}")
    public ResponseEntity<HostProfile> getById(@PathVariable Long id) {
        return repository.findById(id)
                .map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }

    @PostMapping
    public HostProfile create(@RequestBody HostProfile profile) {
        return repository.save(profile);
    }

    @PutMapping("/{id}")
    public ResponseEntity<HostProfile> update(@PathVariable Long id, @RequestBody HostProfile details) {
        return repository.findById(id)
                .map(existing -> {
                    existing.setProfileId(details.getProfileId());
                    existing.setName(details.getName());
                    existing.setHostServerUrl(details.getHostServerUrl());
                    existing.setImageUrl(details.getImageUrl());
                    existing.setIsActive(details.getIsActive());
                    existing.setHostname(details.getHostname());
                    existing.setIpAddress(details.getIpAddress());
                    existing.setEnvironment(details.getEnvironment());
                    existing.setOperatingSystem(details.getOperatingSystem());
                    existing.setCpuCores(details.getCpuCores());
                    existing.setMemoryMb(details.getMemoryMb());
                    existing.setDiskGb(details.getDiskGb());
                    existing.setRegion(details.getRegion());
                    existing.setCloudProvider(details.getCloudProvider());
                    existing.setStatus(details.getStatus());
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
