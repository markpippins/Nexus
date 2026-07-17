package com.aibizarchitect.nexus.v1.spring.serviceregistry.service;

import com.aibizarchitect.nexus.v1.spring.serviceregistry.entity.Service;
import com.aibizarchitect.nexus.v1.spring.serviceregistry.entity.SystemServices;
import com.aibizarchitect.nexus.v1.spring.serviceregistry.entity.SystemType;
import com.aibizarchitect.nexus.v1.spring.serviceregistry.entity.Systems;
import com.aibizarchitect.nexus.v1.spring.serviceregistry.repository.ServiceRepository;
import com.aibizarchitect.nexus.v1.spring.serviceregistry.repository.SystemServicesRepository;
import com.aibizarchitect.nexus.v1.spring.serviceregistry.repository.SystemTypeRepository;
import com.aibizarchitect.nexus.v1.spring.serviceregistry.repository.SystemsRepository;
import lombok.RequiredArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.stream.Collectors;

/**
 * Service for managing domain-level system groupings.
 * Groups services into logical systems (e.g., Harvest Pipeline, Agent Management).
 */
@org.springframework.stereotype.Service
@RequiredArgsConstructor
public class DomainSystemService {

    private static final Logger log = LoggerFactory.getLogger(DomainSystemService.class);

    private final SystemTypeRepository systemTypeRepository;
    private final SystemsRepository systemsRepository;
    private final SystemServicesRepository systemServicesRepository;
    private final ServiceRepository serviceRepository;

    /**
     * Get all system types (categories).
     */
    public List<SystemType> getAllSystemTypes() {
        return systemTypeRepository.findAll();
    }

    /**
     * Get all systems with their type information.
     */
    public List<Systems> getAllSystems() {
        return systemsRepository.findAllActive();
    }

    /**
     * Get a specific system by name.
     */
    public Optional<Systems> getSystem(String name) {
        return systemsRepository.findByName(name);
    }

    /**
     * Get all services belonging to a system.
     */
    public List<SystemServices> getServicesInSystem(String systemName) {
        return systemServicesRepository.findBySystemName(systemName);
    }

    /**
     * Get all systems a service belongs to.
     */
    public List<SystemServices> getSystemsForService(String serviceName) {
        return systemServicesRepository.findByServiceName(serviceName);
    }

    /**
     * Add a service to a system with a specific role.
     */
    public SystemServices addServiceToSystem(String systemName, String serviceName, String role) {
        Systems system = systemsRepository.findByName(systemName)
                .orElseThrow(() -> new IllegalArgumentException("System not found: " + systemName));
        com.aibizarchitect.nexus.v1.spring.serviceregistry.entity.Service service = serviceRepository.findByName(serviceName)
                .orElseThrow(() -> new IllegalArgumentException("Service not found: " + serviceName));

        if (systemServicesRepository.existsBySystemIdAndServiceId(system.getId(), service.getId())) {
            throw new IllegalArgumentException("Service already in system");
        }

        SystemServices ss = new SystemServices();
        ss.setSystem(system);
        ss.setService(service);
        ss.setRoleInSystem(role);

        SystemServices saved = systemServicesRepository.save(ss);
        log.info("Added service {} to system {} with role {}", serviceName, systemName, role);
        return saved;
    }

    /**
     * Remove a service from a system.
     */
    public void removeServiceFromSystem(String systemName, String serviceName) {
        systemServicesRepository.findBySystemNameAndServiceName(systemName, serviceName)
                .ifPresent(ss -> {
                    systemServicesRepository.delete(ss);
                    log.info("Removed service {} from system {}", serviceName, systemName);
                });
    }

    /**
     * Create a new system type category.
     */
    public SystemType createSystemType(String name, String description) {
        if (systemTypeRepository.existsByName(name)) {
            throw new IllegalArgumentException("System type already exists: " + name);
        }
        SystemType type = new SystemType();
        type.setName(name);
        type.setDescription(description);
        return systemTypeRepository.save(type);
    }

    /**
     * Create a new system instance.
     */
    public Systems createSystem(String name, String typeName, String description) {
        if (systemsRepository.existsByName(name)) {
            throw new IllegalArgumentException("System already exists: " + name);
        }
        SystemType type = systemTypeRepository.findByName(typeName)
                .orElseThrow(() -> new IllegalArgumentException("System type not found: " + typeName));

        Systems system = new Systems();
        system.setName(name);
        system.setSystemType(type);
        system.setDescription(description);
        return systemsRepository.save(system);
    }

    /**
     * Get a summary of all systems with their service counts.
     */
    public List<Map<String, Object>> getSystemSummary() {
        return systemsRepository.findAllActive().stream()
                .map(system -> {
                    long serviceCount = systemServicesRepository.findBySystemId(system.getId()).size();
                    java.util.Map<String, Object> map = new java.util.HashMap<>();
                    map.put("id", system.getId());
                    map.put("name", system.getName());
                    map.put("type", system.getSystemType().getName());
                    map.put("description", system.getDescription());
                    map.put("serviceCount", serviceCount);
                    return map;
                })
                .collect(Collectors.toList());
    }
}
