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
import nexus.serviceregistry.v1.entity.Service;
import nexus.serviceregistry.v1.repository.ServiceRepository;

@RestController
@RequestMapping("/api/v0/services")
@CrossOrigin(origins = "*")
@Deprecated(since = "v1", forRemoval = true)
public class ServiceControllerV0 {

    private static final Logger log = LoggerFactory.getLogger(ServiceControllerV0.class);

    private final ServicesConsoleClient client;
    private final ServiceRepository serviceRepository;

    public ServiceControllerV0(ServicesConsoleClient client, ServiceRepository serviceRepository) {
        this.client = client;
        this.serviceRepository = serviceRepository;
    }

    @GetMapping
    @Deprecated(since = "v1", forRemoval = true)
    public List<Service> getAllServices() {
        log.info("Fetching all services from database");
        return serviceRepository.findAll();
    }

    @GetMapping("/all")
    @Deprecated(since = "v1", forRemoval = true)
    public List<Service> getAllServicesIncludingInactive() {
        log.info("Fetching ALL services from database (including inactive)");
        return serviceRepository.findAll();
    }

    @GetMapping("/{id}")
    @Deprecated(since = "v1", forRemoval = true)
    public ResponseEntity<Service> getServiceById(@PathVariable Long id) {
        log.info("Fetching service by ID: {}", id);
        Optional<Service> service = serviceRepository.findById(id);
        return service.map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }

    @GetMapping("/name/{name}")
    @Deprecated(since = "v1", forRemoval = true)
    public ResponseEntity<Service> getServiceByName(@PathVariable String name) {
        log.info("Fetching service by name: {}", name);
        Optional<Service> service = serviceRepository.findByName(name);
        return service.map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }

    @GetMapping("/framework/{frameworkId}")
    @Deprecated(since = "v1", forRemoval = true)
    public List<Service> getServicesByFramework(@PathVariable Long frameworkId) {
        log.info("Fetching services by framework ID: {}", frameworkId);
        return serviceRepository.findByFramework_Id(frameworkId);
    }

    @GetMapping("/{id}/dependencies")
    @Deprecated(since = "v1", forRemoval = true)
    public ResponseEntity<List<Service>> getServiceDependencies(@PathVariable Long id) {
        log.info("Fetching dependencies for service: {}", id);
        // This would require a custom query or method in the repository
        // For now, returning empty list
        return ResponseEntity.ok(List.of());
    }

    @GetMapping("/{id}/dependents")
    @Deprecated(since = "v1", forRemoval = true)
    public ResponseEntity<List<Service>> getServiceDependents(@PathVariable String id) {
        log.info("Fetching dependents for service: {}", id);
        // This would require a custom query or method in the repository
        // For now, returning empty list
        return ResponseEntity.ok(List.of());
    }

    @GetMapping("/{id}/sub-modules")
    @Deprecated(since = "v1", forRemoval = true)
    public ResponseEntity<List<Service>> getSubModules(@PathVariable Long id) {
        log.info("Fetching sub-modules for service: {}", id);
        List<Service> subModules = serviceRepository.findByParentService_Id(id);
        return ResponseEntity.ok(subModules);
    }

    @GetMapping("/standalone")
    @Deprecated(since = "v1", forRemoval = true)
    public List<Service> getStandaloneServices() {
        log.info("Fetching standalone/parent services (parentService is null)");
        return serviceRepository.findByParentServiceIsNull();
    }

    @PostMapping
    @Deprecated(since = "v1", forRemoval = true)
    public ResponseEntity<Service> createService(@RequestBody Service service) {
        log.info("Creating new service: {}", service.getName());

        // Validate that service name is unique
        if (serviceRepository.findByName(service.getName()).isPresent()) {
            log.warn("Service with name {} already exists", service.getName());
            return ResponseEntity.badRequest().build();
        }

        // Set active flag
        service.setActiveFlag(true);

        Service savedService = serviceRepository.save(service);
        log.info("Successfully created service with ID: {}", savedService.getId());
        return ResponseEntity.ok(savedService);
    }

    @PutMapping("/{id}")
    @Deprecated(since = "v1", forRemoval = true)
    public ResponseEntity<Service> updateService(@PathVariable Long id, @RequestBody Service service) {
        log.info("Updating service with ID: {}", id);

        Optional<Service> existingServiceOpt = serviceRepository.findById(id);
        if (existingServiceOpt.isEmpty()) {
            log.warn("Service with ID {} not found", id);
            return ResponseEntity.notFound().build();
        }

        // Check if name is being changed and if new name already exists
        Service existingService = existingServiceOpt.get();
        if (!existingService.getName().equals(service.getName())) {
            if (serviceRepository.findByName(service.getName()).isPresent()) {
                log.warn("Service with name {} already exists", service.getName());
                return ResponseEntity.badRequest().build();
            }
        }

        // Merge the incoming data with the existing entity
        existingService.setName(service.getName());
        existingService.setDescription(service.getDescription());
        existingService.setDefaultPort(service.getDefaultPort());
        existingService.setApiBasePath(service.getApiBasePath());
        existingService.setRepositoryUrl(service.getRepositoryUrl());
        existingService.setVersion(service.getVersion());
        existingService.setStatus(service.getStatus());
        existingService.setActiveFlag(service.getActiveFlag());

        // Preserve existing relationships if not explicitly provided in the request
        if (service.getFramework() != null) {
            existingService.setFramework(service.getFramework());
        }
        if (service.getType() != null) {
            existingService.setType(service.getType());
        }
        if (service.getParentService() != null) {
            existingService.setParentService(service.getParentService());
        }
        if (service.getComponentOverride() != null) {
            existingService.setComponentOverride(service.getComponentOverride());
        }

        Service updatedService = serviceRepository.save(existingService);
        log.info("Successfully updated service with ID: {}", id);
        return ResponseEntity.ok(updatedService);
    }

    @DeleteMapping("/{id}")
    @Deprecated(since = "v1", forRemoval = true)
    public ResponseEntity<Void> deleteService(@PathVariable Long id) {
        log.info("Deleting service with ID: {}", id);

        Optional<Service> serviceOpt = serviceRepository.findById(id);
        if (serviceOpt.isEmpty()) {
            log.warn("Service with ID {} not found", id);
            return ResponseEntity.notFound().build();
        }

        // TODO: Check if service has deployments before deleting
        // For now, just delete
        serviceRepository.deleteById(id);
        log.info("Successfully deleted service with ID: {}", id);
        return ResponseEntity.noContent().build();
    }
}
