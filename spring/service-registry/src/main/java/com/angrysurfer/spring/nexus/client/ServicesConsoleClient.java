package com.angrysurfer.spring.nexus.client;

import com.angrysurfer.spring.nexus.entity.*;
import com.angrysurfer.spring.nexus.repository.*;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * Client for accessing services-console-backend data directly from the shared
 * database.
 *
 * NOTE: This client now accesses data directly from the database since both
 * services
 * share the same database. This replaces the previous HTTP-based
 * synchronization.
 */
@Service
public class ServicesConsoleClient {

    private static final Logger log = LoggerFactory.getLogger(ServicesConsoleClient.class);

    private final ServiceRepository serviceRepository;
    private final FrameworkRepository frameworkRepository;
    private final FrameworkCategoryRepository categoryRepository;
    private final FrameworkLanguageRepository languageRepository;
    private final ServiceTypeRepository serviceTypeRepository;
    private final ServerTypeRepository serverTypeRepository;
    private final EnvironmentTypeRepository environmentTypeRepository;
    private final HostRepository hostRepository;
    private final DeploymentRepository deploymentRepository;
    private final ServiceConfigurationRepository serviceConfigurationRepository;
    private final ServiceDependencyRepository serviceDependencyRepository;

    public ServicesConsoleClient(
            ServiceRepository serviceRepository,
            FrameworkRepository frameworkRepository,
            FrameworkCategoryRepository categoryRepository,
            FrameworkLanguageRepository languageRepository,
            ServiceTypeRepository serviceTypeRepository,
            ServerTypeRepository serverTypeRepository,
            EnvironmentTypeRepository environmentTypeRepository,
            HostRepository hostRepository,
            DeploymentRepository deploymentRepository,
            ServiceConfigurationRepository serviceConfigurationRepository,
            ServiceDependencyRepository serviceDependencyRepository) {
        this.serviceRepository = serviceRepository;
        this.frameworkRepository = frameworkRepository;
        this.categoryRepository = categoryRepository;
        this.languageRepository = languageRepository;
        this.serviceTypeRepository = serviceTypeRepository;
        this.serverTypeRepository = serverTypeRepository;
        this.environmentTypeRepository = environmentTypeRepository;
        this.hostRepository = hostRepository;
        this.deploymentRepository = deploymentRepository;
        this.serviceConfigurationRepository = serviceConfigurationRepository;
        this.serviceDependencyRepository = serviceDependencyRepository;
    }

    // --- Frameworks ---
    public List<Framework> getFrameworks() {
        log.info("Fetching all frameworks from database");
        return frameworkRepository.findAll();
    }

    public Optional<Framework> findFrameworkByName(String name) {
        log.info("Fetching framework by name: {}", name);
        return frameworkRepository.findByName(name);
    }

    public void createFramework(Map<String, Object> framework) {
        log.warn("Direct database creation not implemented in this client");
        // Framework creation should be handled by appropriate service
    }

    // --- Services ---
    public List<com.angrysurfer.spring.nexus.entity.Service> getServices() {
        log.info("Fetching all services from database");
        return serviceRepository.findAll();
    }

    public Optional<com.angrysurfer.spring.nexus.entity.Service> findServiceByName(String name) {
        log.info("Fetching service by name: {}", name);
        return serviceRepository.findByName(name);
    }

    public void createService(Map<String, Object> service) {
        log.warn("Direct database creation not implemented in this client");
        // Service creation should be handled by appropriate service
    }

    // --- Categories ---
    public List<FrameworkCategory> getCategories() {
        log.info("Fetching all categories from database");
        return categoryRepository.findAll();
    }

    public Optional<FrameworkCategory> findCategoryByName(String name) {
        log.info("Fetching category by name: {}", name);
        return categoryRepository.findByName(name);
    }

    public void createCategory(Map<String, Object> category) {
        log.warn("Direct database creation not implemented in this client");
    }

    // --- Languages ---
    public List<FrameworkLanguage> getLanguages() {
        log.info("Fetching all languages from database");
        return languageRepository.findAll();
    }

    public Optional<FrameworkLanguage> findLanguageByName(String name) {
        log.info("Fetching language by name: {}", name);
        return languageRepository.findByName(name);
    }

    public void createLanguage(Map<String, Object> language) {
        log.warn("Direct database creation not implemented in this client");
    }

    // --- Service Types ---
    public List<ServiceType> getServiceTypes() {
        log.info("Fetching all service types from database");
        return serviceTypeRepository.findAll();
    }

    public Optional<ServiceType> findServiceTypeByName(String name) {
        log.info("Fetching service type by name: {}", name);
        return serviceTypeRepository.findByName(name);
    }

    public void createServiceType(Map<String, Object> type) {
        log.warn("Direct database creation not implemented in this client");
    }

    // --- Server Types ---
    public List<ServerType> getServerTypes() {
        log.info("Fetching all server types from database");
        return serverTypeRepository.findAll();
    }

    public Optional<ServerType> findServerTypeByName(String name) {
        log.info("Fetching server type by name: {}", name);
        return serverTypeRepository.findByName(name);
    }

    public void createServerType(Map<String, Object> type) {
        log.warn("Direct database creation not implemented in this client");
    }

    // --- Servers (Hosts) ---
    public List<Host> getServers() {
        log.info("Fetching all servers from database");
        return hostRepository.findAll();
    }

    public Optional<Host> findServerByHostname(String hostname) {
        log.info("Fetching server by hostname: {}", hostname);
        return hostRepository.findByHostname(hostname);
    }

    public void createServer(Map<String, Object> server) {
        log.warn("Direct database creation not implemented in this client");
    }

    // --- Deployments ---
    public List<Deployment> getDeployments() {
        log.info("Fetching all deployments from database");
        return deploymentRepository.findAll();
    }

    public List<Deployment> findByEnvironmentId(Long environmentId) {
        log.info("Fetching deployments by environment ID: {}", environmentId);
        return deploymentRepository.findByEnvironmentId(environmentId);
    }

    public void createDeployment(Map<String, Object> deployment) {
        log.warn("Direct database creation not implemented in this client");
    }

    // --- Configurations ---
    public List<ServiceConfiguration> getServiceConfigs() {
        log.info("Fetching all service configurations from database");
        return serviceConfigurationRepository.findAll();
    }

    public void createServiceConfig(Map<String, Object> config) {
        log.warn("Direct database creation not implemented in this client");
    }

    // --- Dependencies ---
    public List<ServiceDependency> getServiceDependencies() {
        log.info("Fetching all service dependencies from database");
        return serviceDependencyRepository.findAll();
    }

    public void createServiceDependency(Map<String, Object> dependency) {
        log.warn("Direct database creation not implemented in this client");
    }
}
