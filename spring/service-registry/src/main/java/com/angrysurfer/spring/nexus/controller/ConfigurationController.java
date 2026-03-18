package com.angrysurfer.spring.nexus.controller;


import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.angrysurfer.spring.nexus.entity.ServiceConfiguration;
import com.angrysurfer.spring.nexus.repository.ServiceConfigurationRepository;

@RestController
@RequestMapping("/api/v1/configurations")
@CrossOrigin(origins = "*")
public class ConfigurationController {

    private static final Logger log = LoggerFactory.getLogger(ConfigurationController.class);

    @Autowired
    private ServiceConfigurationRepository configurationRepository;

    @GetMapping
    public ResponseEntity<?> getConfigurations(
            @RequestParam(required = false) Long serviceId,
            @RequestParam(required = false) Long environmentId,
            @RequestParam(required = false) String configKey,
            org.springframework.data.domain.Pageable pageable) {

        if (serviceId != null && environmentId != null && configKey != null) {
            log.info("Fetching configuration by service ID: {}, key: {}, environment ID: {}", serviceId, configKey, environmentId);
            return configurationRepository.findByServiceIdAndConfigKeyAndEnvironmentId(serviceId, configKey, environmentId)
                    .map(config -> {
                        log.debug("Configuration found for service ID: {}, key: {}, environment ID: {}", serviceId, configKey, environmentId);
                        return ResponseEntity.ok(config);
                    })
                    .orElseGet(() -> {
                        log.warn("Configuration not found for service ID: {}, key: {}, environment ID: {}", serviceId, configKey, environmentId);
                        return ResponseEntity.notFound().build();
                    });
        } else if (serviceId != null && environmentId != null) {
            log.info("Fetching configurations by service ID: {} and environment ID: {}", serviceId, environmentId);
            org.springframework.data.domain.Page<ServiceConfiguration> configurations = configurationRepository.findByServiceIdAndEnvironmentId(serviceId, environmentId, pageable);
            log.debug("Fetched {} configurations for service ID: {} and environment ID: {}", configurations.getNumberOfElements(), serviceId, environmentId);
            return ResponseEntity.ok(new com.angrysurfer.spring.nexus.dto.PagedResponse<>(configurations));
        } else if (serviceId != null) {
            log.info("Fetching configurations by service ID: {}", serviceId);
            org.springframework.data.domain.Page<ServiceConfiguration> configurations = configurationRepository.findByServiceId(serviceId, pageable);
            log.debug("Fetched {} configurations for service ID: {}", configurations.getNumberOfElements(), serviceId);
            return ResponseEntity.ok(new com.angrysurfer.spring.nexus.dto.PagedResponse<>(configurations));
        } else {
            log.info("Fetching all configurations");
            org.springframework.data.domain.Page<ServiceConfiguration> configurations = configurationRepository.findAll(pageable);
            log.debug("Fetched {} configurations", configurations.getNumberOfElements());
            return ResponseEntity.ok(new com.angrysurfer.spring.nexus.dto.PagedResponse<>(configurations));
        }
    }

    @GetMapping("/{id}")
    public ResponseEntity<ServiceConfiguration> getConfigurationById(@PathVariable Long id) {
        log.info("Fetching configuration by ID: {}", id);
        return configurationRepository.findById(id)
                .map(config -> {
                    log.debug("Configuration found with ID: {}", id);
                    return ResponseEntity.ok(config);
                })
                .orElseGet(() -> {
                    log.warn("Configuration not found with ID: {}", id);
                    return ResponseEntity.notFound().build();
                });
    }

    @PostMapping
    public ResponseEntity<ServiceConfiguration> createConfiguration(@RequestBody ServiceConfiguration configuration) {
        log.info("Creating configuration with key: {}", configuration.getConfigKey());
        try {
            ServiceConfiguration savedConfiguration = configurationRepository.save(configuration);
            log.info("Configuration created successfully with ID: {}", savedConfiguration.getId());
            java.net.URI location = org.springframework.web.servlet.support.ServletUriComponentsBuilder
                    .fromCurrentRequest()
                    .path("/{id}")
                    .buildAndExpand(savedConfiguration.getId())
                    .toUri();
            return ResponseEntity.created(location).body(savedConfiguration);
        } catch (Exception e) {
            log.error("Error creating configuration with key: {}", configuration.getConfigKey(), e);
            throw e;
        }
    }

    @PutMapping("/{id}")
    public ResponseEntity<ServiceConfiguration> updateConfiguration(
            @PathVariable Long id,
            @RequestBody ServiceConfiguration configDetails) {
        log.info("Updating configuration with ID: {}", id);
        return configurationRepository.findById(id)
                .map(config -> {
                    config.setConfigKey(configDetails.getConfigKey());
                    config.setConfigValue(configDetails.getConfigValue());
                    config.setEnvironmentId(configDetails.getEnvironmentId());
                    config.setConfigTypeId(configDetails.getConfigTypeId());
                    config.setIsSecret(configDetails.getIsSecret());
                    config.setDescription(configDetails.getDescription());
                    ServiceConfiguration updatedConfig = configurationRepository.save(config);
                    log.info("Configuration updated successfully with ID: {}", updatedConfig.getId());
                    return ResponseEntity.ok(updatedConfig);
                })
                .orElseGet(() -> {
                    log.warn("Configuration not found with ID: {} for update", id);
                    return ResponseEntity.notFound().build();
                });
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> deleteConfiguration(@PathVariable Long id) {
        log.info("Deleting configuration with ID: {}", id);
        return configurationRepository.findById(id)
                .map(config -> {
                    configurationRepository.delete(config);
                    log.info("Configuration deleted successfully with ID: {}", id);
                    return ResponseEntity.noContent().<Void>build();
                })
                .orElseGet(() -> {
                    log.warn("Configuration not found with ID: {} for deletion", id);
                    return ResponseEntity.notFound().build();
                });
    }
}
