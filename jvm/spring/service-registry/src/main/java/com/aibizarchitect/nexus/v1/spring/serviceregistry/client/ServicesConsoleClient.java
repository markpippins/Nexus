package com.aibizarchitect.nexus.v1.spring.serviceregistry.client;

import java.util.List;
import java.util.Map;
import java.util.Optional;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import com.aibizarchitect.nexus.v1.spring.serviceregistry.entity.Deployment;
import com.aibizarchitect.nexus.v1.spring.serviceregistry.entity.Framework;
import com.aibizarchitect.nexus.v1.spring.serviceregistry.entity.FrameworkType;
import com.aibizarchitect.nexus.v1.spring.serviceregistry.entity.FrameworkLanguage;
import com.aibizarchitect.nexus.v1.spring.serviceregistry.entity.Server;
import com.aibizarchitect.nexus.v1.spring.serviceregistry.entity.ServerType;
import com.aibizarchitect.nexus.v1.spring.serviceregistry.entity.ServiceConfiguration;
import com.aibizarchitect.nexus.v1.spring.serviceregistry.entity.ServiceDependency;
import com.aibizarchitect.nexus.v1.spring.serviceregistry.entity.ServiceType;
import com.aibizarchitect.nexus.v1.spring.serviceregistry.repository.DeploymentRepository;
import com.aibizarchitect.nexus.v1.spring.serviceregistry.repository.FrameworkTypeRepository;
import com.aibizarchitect.nexus.v1.spring.serviceregistry.repository.FrameworkLanguageRepository;
import com.aibizarchitect.nexus.v1.spring.serviceregistry.repository.FrameworkRepository;
import com.aibizarchitect.nexus.v1.spring.serviceregistry.repository.ServerRepository;
import com.aibizarchitect.nexus.v1.spring.serviceregistry.repository.ServerTypeRepository;
import com.aibizarchitect.nexus.v1.spring.serviceregistry.repository.ServiceConfigurationRepository;
import com.aibizarchitect.nexus.v1.spring.serviceregistry.repository.ServiceDependencyRepository;
import com.aibizarchitect.nexus.v1.spring.serviceregistry.repository.ServiceRepository;
import com.aibizarchitect.nexus.v1.spring.serviceregistry.repository.ServiceTypeRepository;

/**
 * Client for accessing services-console-backend data directly from the shared
 * database.
 */
@Service
public class ServicesConsoleClient {

    private static final Logger log = LoggerFactory.getLogger(ServicesConsoleClient.class);

    private final ServiceRepository serviceRepository;
    private final FrameworkRepository frameworkRepository;
    private final FrameworkTypeRepository frameworkTypeRepository;
    private final FrameworkLanguageRepository languageRepository;
    private final ServiceTypeRepository serviceTypeRepository;
    private final ServerTypeRepository serverTypeRepository;
    private final ServerRepository serverRepository;
    private final DeploymentRepository deploymentRepository;
    private final ServiceConfigurationRepository serviceConfigurationRepository;
    private final ServiceDependencyRepository serviceDependencyRepository;

    public ServicesConsoleClient(
            ServiceRepository serviceRepository,
            FrameworkRepository frameworkRepository,
            FrameworkTypeRepository frameworkTypeRepository,
            FrameworkLanguageRepository languageRepository,
            ServiceTypeRepository serviceTypeRepository,
            ServerTypeRepository serverTypeRepository,
            ServerRepository serverRepository,
            DeploymentRepository deploymentRepository,
            ServiceConfigurationRepository serviceConfigurationRepository,
            ServiceDependencyRepository serviceDependencyRepository) {
        this.serviceRepository = serviceRepository;
        this.frameworkRepository = frameworkRepository;
        this.frameworkTypeRepository = frameworkTypeRepository;
        this.languageRepository = languageRepository;
        this.serviceTypeRepository = serviceTypeRepository;
        this.serverTypeRepository = serverTypeRepository;
        this.serverRepository = serverRepository;
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
    }

    // --- Services ---
    public List<com.aibizarchitect.nexus.v1.spring.serviceregistry.entity.Service> getServices() {
        log.info("Fetching all services from database");
        return serviceRepository.findAll();
    }

    public Optional<com.aibizarchitect.nexus.v1.spring.serviceregistry.entity.Service> findServiceByName(String name) {
        log.info("Fetching service by name: {}", name);
        return serviceRepository.findByName(name);
    }

    public void createService(Map<String, Object> service) {
        log.warn("Direct database creation not implemented in this client");
    }

    // --- Framework Types ---
    public List<FrameworkType> getFrameworkTypes() {
        log.info("Fetching all framework types from database");
        return frameworkTypeRepository.findAll();
    }

    public Optional<FrameworkType> findFrameworkTypeByName(String name) {
        log.info("Fetching framework type by name: {}", name);
        return frameworkTypeRepository.findByName(name);
    }

    public void createFrameworkType(Map<String, Object> frameworkType) {
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

    // --- Servers ---
    public List<Server> getServers() {
        log.info("Fetching all servers from database");
        return serverRepository.findAll();
    }

    public Optional<Server> findServerByHostname(String hostname) {
        log.info("Fetching server by hostname: {}", hostname);
        return serverRepository.findByHostname(hostname);
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
