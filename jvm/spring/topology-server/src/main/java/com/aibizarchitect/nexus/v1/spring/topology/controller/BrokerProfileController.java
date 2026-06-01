package com.aibizarchitect.nexus.v1.spring.topology.controller;

import com.aibizarchitect.nexus.v1.spring.topology.dto.SpringPagedResponse;
import com.aibizarchitect.nexus.v1.spring.topology.entity.BrokerProfile;
import com.aibizarchitect.nexus.v1.spring.topology.repository.BrokerProfileRepository;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.data.web.PageableDefault;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/v1/broker-profiles")
@CrossOrigin(origins = "*")
public class BrokerProfileController {

    private final BrokerProfileRepository repository;

    public BrokerProfileController(BrokerProfileRepository repository) {
        this.repository = repository;
    }

    @GetMapping
    public ResponseEntity<Map<String, Object>> getAll(
            @PageableDefault(sort = "name", direction = Sort.Direction.ASC, size = 200) Pageable pageable) {
        return ResponseEntity.ok(SpringPagedResponse.fromPage(repository.findAll(pageable)));
    }

    @GetMapping("/{id}")
    public ResponseEntity<BrokerProfile> getById(@PathVariable Long id) {
        return repository.findById(id)
                .map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }

    @PostMapping
    public BrokerProfile create(@RequestBody BrokerProfile profile) {
        return repository.save(profile);
    }

    @PutMapping("/{id}")
    public ResponseEntity<BrokerProfile> update(@PathVariable Long id, @RequestBody BrokerProfile details) {
        return repository.findById(id)
                .map(existing -> {
                    existing.setProfileId(details.getProfileId());
                    existing.setName(details.getName());
                    existing.setBrokerUrl(details.getBrokerUrl());
                    existing.setImageUrl(details.getImageUrl());
                    existing.setAutoConnect(details.getAutoConnect());
                    existing.setHealthCheckDelayMinutes(details.getHealthCheckDelayMinutes());
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
