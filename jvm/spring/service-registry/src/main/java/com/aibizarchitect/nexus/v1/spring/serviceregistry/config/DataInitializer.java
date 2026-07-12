package com.aibizarchitect.nexus.v1.spring.serviceregistry.config;

import java.io.IOException;
import java.io.InputStream;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.CommandLineRunner;
import org.springframework.core.io.Resource;
import org.springframework.core.io.ResourceLoader;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import com.aibizarchitect.nexus.v1.spring.serviceregistry.entity.Deployment;
import com.aibizarchitect.nexus.v1.spring.serviceregistry.entity.EnvironmentType;
import com.aibizarchitect.nexus.v1.spring.serviceregistry.entity.Framework;
import com.aibizarchitect.nexus.v1.spring.serviceregistry.entity.FrameworkType;
import com.aibizarchitect.nexus.v1.spring.serviceregistry.entity.FrameworkLanguage;
import com.aibizarchitect.nexus.v1.spring.serviceregistry.entity.FrameworkVendor;
import com.aibizarchitect.nexus.v1.spring.serviceregistry.entity.Library;
import com.aibizarchitect.nexus.v1.spring.serviceregistry.entity.LibraryType;
import com.aibizarchitect.nexus.v1.spring.serviceregistry.entity.OperatingSystem;
import com.aibizarchitect.nexus.v1.spring.serviceregistry.entity.Server;
import com.aibizarchitect.nexus.v1.spring.serviceregistry.entity.ServerType;
import com.aibizarchitect.nexus.v1.spring.serviceregistry.entity.Service;
import com.aibizarchitect.nexus.v1.spring.serviceregistry.entity.ServiceType;
import com.aibizarchitect.nexus.v1.spring.serviceregistry.repository.DeploymentRepository;
import com.aibizarchitect.nexus.v1.spring.serviceregistry.repository.EnvironmentTypeRepository;
import com.aibizarchitect.nexus.v1.spring.serviceregistry.repository.FrameworkTypeRepository;
import com.aibizarchitect.nexus.v1.spring.serviceregistry.repository.FrameworkLanguageRepository;
import com.aibizarchitect.nexus.v1.spring.serviceregistry.repository.FrameworkRepository;
import com.aibizarchitect.nexus.v1.spring.serviceregistry.repository.FrameworkVendorRepository;
import com.aibizarchitect.nexus.v1.spring.serviceregistry.repository.ServerRepository;
import com.aibizarchitect.nexus.v1.spring.serviceregistry.repository.ServerTypeRepository;
import com.aibizarchitect.nexus.v1.spring.serviceregistry.repository.LibraryTypeRepository;
import com.aibizarchitect.nexus.v1.spring.serviceregistry.repository.LibraryRepository;
import com.aibizarchitect.nexus.v1.spring.serviceregistry.repository.OperatingSystemRepository;
import com.aibizarchitect.nexus.v1.spring.serviceregistry.repository.ServiceConfigurationRepository;
import com.aibizarchitect.nexus.v1.spring.serviceregistry.repository.ServiceDependencyRepository;
import com.aibizarchitect.nexus.v1.spring.serviceregistry.repository.ServiceRepository;
import com.aibizarchitect.nexus.v1.spring.serviceregistry.repository.ServiceTypeRepository;
import com.aibizarchitect.nexus.v1.spring.serviceregistry.service.CacheWarmingService;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;

@Component
public class DataInitializer implements CommandLineRunner {

    private static final Logger log = LoggerFactory.getLogger(DataInitializer.class);

    private final ObjectMapper objectMapper;
    private final ResourceLoader resourceLoader;

    private final ServiceRepository serviceRepository;
    private final FrameworkRepository frameworkRepository;
    private final FrameworkTypeRepository frameworkTypeRepository;
    private final FrameworkLanguageRepository languageRepository;
    private final ServiceTypeRepository serviceTypeRepository;
    private final ServerTypeRepository serverTypeRepository;
    private final EnvironmentTypeRepository environmentTypeRepository;
    private final ServerRepository serverRepository;
    private final DeploymentRepository deploymentRepository;
    private final ServiceConfigurationRepository configurationRepository;
    private final ServiceDependencyRepository serviceDependencyRepository;
    private final LibraryTypeRepository libraryTypeRepository;
    private final LibraryRepository libraryRepository;
    private final OperatingSystemRepository operatingSystemRepository;
    private final FrameworkVendorRepository frameworkVendorRepository;
    private final CacheWarmingService cacheWarmingService;

    public DataInitializer(ObjectMapper objectMapper, ResourceLoader resourceLoader, ServiceRepository serviceRepository,
            FrameworkRepository frameworkRepository, FrameworkTypeRepository frameworkTypeRepository,
            FrameworkLanguageRepository languageRepository, ServiceTypeRepository serviceTypeRepository,
            ServerTypeRepository serverTypeRepository, EnvironmentTypeRepository environmentTypeRepository,
            ServerRepository serverRepository, DeploymentRepository deploymentRepository,
            ServiceConfigurationRepository configurationRepository, ServiceDependencyRepository serviceDependencyRepository,
            LibraryTypeRepository libraryTypeRepository, LibraryRepository libraryRepository,
            OperatingSystemRepository operatingSystemRepository, FrameworkVendorRepository frameworkVendorRepository,
            CacheWarmingService cacheWarmingService) {
        this.objectMapper = objectMapper;
        this.resourceLoader = resourceLoader;
        this.serviceRepository = serviceRepository;
        this.frameworkRepository = frameworkRepository;
        this.frameworkTypeRepository = frameworkTypeRepository;
        this.languageRepository = languageRepository;
        this.serviceTypeRepository = serviceTypeRepository;
        this.serverTypeRepository = serverTypeRepository;
        this.environmentTypeRepository = environmentTypeRepository;
        this.serverRepository = serverRepository;
        this.deploymentRepository = deploymentRepository;
        this.configurationRepository = configurationRepository;
        this.serviceDependencyRepository = serviceDependencyRepository;
        this.libraryTypeRepository = libraryTypeRepository;
        this.libraryRepository = libraryRepository;
        this.operatingSystemRepository = operatingSystemRepository;
        this.frameworkVendorRepository = frameworkVendorRepository;
        this.cacheWarmingService = cacheWarmingService;
    }

    // Cache to store lookup entities during initialization
    private final Map<String, FrameworkType> frameworkTypeCache = new HashMap<>();
    private final Map<String, FrameworkLanguage> languageCache = new HashMap<>();
    private final Map<String, ServiceType> serviceTypeCache = new HashMap<>();
    private final Map<String, ServerType> serverTypeCache = new HashMap<>();
    private final Map<String, EnvironmentType> environmentTypeCache = new HashMap<>();
    private final Map<String, OperatingSystem> osCache = new HashMap<>();
    private final Map<String, FrameworkVendor> vendorCache = new HashMap<>();
    private final Map<String, Framework> frameworkCache = new HashMap<>();
    private final Map<String, Server> serverCache = new HashMap<>();
    private final Map<String, Service> serviceCache = new HashMap<>();
    private final Map<String, LibraryType> libraryTypeCache = new HashMap<>();

    @Override
    @Transactional
    public void run(String... args) {
        log.info("Starting data initialization...");
        try {
            cacheWarmingService.clearAllCaches();

            initializeLookupData();
            initializeFrameworks();
            initializeServers();
            initializeServices();
            initializeLibraryData();
            initializeDeployments();
            initializeServiceDependencies();

            log.info("Data initialization completed successfully.");
            validateDataCounts();
        } catch (Exception e) {
            log.error("Data initialization critical failure", e);
        }
    }

    private void initializeLookupData() throws IOException {
        log.info("Initializing lookup data...");

        // Environment Types
        loadJsonConfig("classpath:config/environment-types.json", new TypeReference<List<Map<String, Object>>>() {
        }).forEach(data -> {
            String name = (String) data.get("name");
            EnvironmentType entity = environmentTypeCache.computeIfAbsent(name, k -> environmentTypeRepository.findByNameIgnoreCase(name)
                    .orElseGet(() -> {
                        EnvironmentType et = new EnvironmentType();
                        et.setName(name);
                        et.setDescription((String) data.get("description"));
                        return environmentTypeRepository.save(et);
                    }));
        });

        // Service Types
        loadJsonConfig("classpath:config/service-types.json", new TypeReference<List<Map<String, Object>>>() {
        }).forEach(data -> {
            String name = (String) data.get("name");
            ServiceType entity = serviceTypeCache.computeIfAbsent(name, k -> serviceTypeRepository.findByNameIgnoreCase(name)
                    .orElseGet(() -> {
                        ServiceType st = new ServiceType();
                        st.setName(name);
                        st.setDescription((String) data.get("description"));
                        return serviceTypeRepository.save(st);
                    }));
        });

        // Server Types
        loadJsonConfig("classpath:config/server-types.json", new TypeReference<List<Map<String, Object>>>() {
        }).forEach(data -> {
            String name = (String) data.get("name");
            ServerType entity = serverTypeCache.computeIfAbsent(name, k -> serverTypeRepository.findByNameIgnoreCase(name)
                    .orElseGet(() -> {
                        ServerType st = new ServerType();
                        st.setName(name);
                        st.setDescription((String) data.get("description"));
                        return serverTypeRepository.save(st);
                    }));
        });

        // OS
        loadJsonConfig("classpath:config/operating-systems.json", new TypeReference<List<Map<String, Object>>>() {
        }).forEach(data -> {
            String name = (String) data.get("name");
            OperatingSystem entity = osCache.computeIfAbsent(name, k -> operatingSystemRepository.findByNameIgnoreCase(name)
                    .orElseGet(() -> {
                        OperatingSystem os = new OperatingSystem();
                        os.setName(name);
                        os.setVersion((String) data.get("version"));
                        os.setArchitecture((String) data.get("architecture"));
                        return operatingSystemRepository.save(os);
                    }));
        });

        // Framework Types
        loadJsonConfig("classpath:config/framework-types.json", new TypeReference<List<Map<String, Object>>>() {
        }).forEach(data -> {
            String name = (String) data.get("name");
            FrameworkType entity = frameworkTypeCache.computeIfAbsent(name, k -> frameworkTypeRepository.findByNameIgnoreCase(name)
                    .orElseGet(() -> {
                        FrameworkType ft = new FrameworkType();
                        ft.setName(name);
                        ft.setDescription((String) data.get("description"));
                        return frameworkTypeRepository.save(ft);
                    }));
        });

        // Framework Languages
        loadJsonConfig("classpath:config/framework-languages.json", new TypeReference<List<Map<String, Object>>>() {
        }).forEach(data -> {
            String name = (String) data.get("name");
            FrameworkLanguage entity = languageCache.computeIfAbsent(name, k -> languageRepository.findByNameIgnoreCase(name)
                    .orElseGet(() -> {
                        FrameworkLanguage fl = new FrameworkLanguage();
                        fl.setName(name);
                        fl.setDescription((String) data.get("description"));
                        return languageRepository.save(fl);
                    }));
        });

        // Framework Vendors
        loadJsonConfig("classpath:config/framework-vendors.json", new TypeReference<List<Map<String, Object>>>() {
        }).forEach(data -> {
            String name = (String) data.get("name");
            FrameworkVendor entity = vendorCache.computeIfAbsent(name, k -> frameworkVendorRepository.findByNameIgnoreCase(name)
                    .orElseGet(() -> {
                        FrameworkVendor fv = new FrameworkVendor();
                        fv.setName(name);
                        fv.setDescription((String) data.get("description"));
                        fv.setUrl((String) data.get("url"));
                        return frameworkVendorRepository.save(fv);
                    }));
        });
    }

    private void initializeFrameworks() throws IOException {
        log.info("Initializing frameworks...");
        loadJsonConfig("classpath:config/frameworks.json", new TypeReference<List<Map<String, Object>>>() {
        }).forEach(data -> {
            String name = (String) data.get("name");
            Framework framework = frameworkCache.computeIfAbsent(name, k -> frameworkRepository.findByName(name).orElseGet(() -> {
                Framework f = new Framework();
                f.setName(name);
                f.setDescription((String) data.get("description"));
                f.setCategory(frameworkTypeCache.get(data.get("category")));
                f.setLanguage(languageCache.get(data.get("language")));
                f.setCurrentVersion((String) data.get("current_version"));
                f.setLtsVersion((String) data.get("lts_version"));
                f.setUrl((String) data.get("url"));
                if (f.getCategory() == null || f.getLanguage() == null) {
                    log.warn("Skipping framework {} due to missing category/language", name);
                    return null;
                }
                return frameworkRepository.save(f);
            }));
        });
    }

    private void initializeServers() throws IOException {
        log.info("Initializing servers...");
        loadJsonConfig("classpath:config/servers.json", new TypeReference<List<Map<String, Object>>>() {
        }).forEach(data -> {
            String hostname = (String) data.get("hostname");
            Server server = serverCache.computeIfAbsent(hostname, k -> serverRepository.findByHostname(hostname).orElseGet(() -> {
                Server s = new Server();
                s.setHostname(hostname);
                s.setIpAddress((String) data.get("ipAddress"));
                s.setType(serverTypeCache.get(data.get("type")));
                s.setEnvironmentType(environmentTypeCache.get(data.get("environment")));
                s.setOperatingSystem(osCache.get(data.get("operatingSystem")));
                s.setCpuCores((Integer) data.get("cpuCores"));
                s.setMemory((String) data.get("memory"));
                s.setDisk((String) data.get("disk"));
                s.setStatus("ACTIVE");
                if (s.getType() == null || s.getEnvironmentType() == null || s.getOperatingSystem() == null) {
                    log.warn("Skipping server {} due to missing type/env/os", hostname);
                    return null;
                }
                return serverRepository.save(s);
            }));
        });
    }

    private void initializeServices() throws IOException {
        log.info("Initializing services...");
        loadJsonConfig("classpath:config/services.json", new TypeReference<List<Map<String, Object>>>() {
        }).forEach(data -> {
            String name = (String) data.get("name");
            Service service = serviceCache.computeIfAbsent(name, k -> serviceRepository.findByName(name).orElseGet(() -> {
                Service s = new Service();
                s.setName(name);
                s.setDescription((String) data.get("description"));
                s.setFramework(frameworkCache.get(data.get("framework")));
                s.setType(serviceTypeCache.get(data.get("type")));
                s.setDefaultPort((Integer) data.get("defaultPort"));
                s.setApiBasePath((String) data.get("apiBasePath"));
                s.setVersion((String) data.get("version"));
                s.setStatus("ACTIVE");
                if (s.getFramework() == null || s.getType() == null) {
                    log.warn("Skipping service {} due to missing framework/type", name);
                    return null;
                }
                return serviceRepository.save(s);
            }));
        });
    }

    private void initializeLibraryData() throws IOException {
        log.info("Initializing library data...");
        // Types
        loadJsonConfig("classpath:config/library-types.json", new TypeReference<List<Map<String, Object>>>() {
        }).forEach(data -> {
            String name = (String) data.get("name");
            LibraryType entity = libraryTypeCache.computeIfAbsent(name, k -> libraryTypeRepository.findByNameIgnoreCase(name)
                    .orElseGet(() -> {
                        LibraryType lt = new LibraryType();
                        lt.setName(name);
                        lt.setDescription((String) data.get("description"));
                        return libraryTypeRepository.save(lt);
                    }));
        });

        // Libraries
        loadJsonConfig("classpath:config/libraries.json", new TypeReference<List<Map<String, Object>>>() {
        }).forEach(data -> {
            String name = (String) data.get("name");
            if (libraryRepository.findByName(name).isEmpty()) {
                Library lib = new Library();
                lib.setName(name);
                lib.setDescription((String) data.get("description"));
                lib.setCategory(libraryTypeCache.get(data.get("category")));
                lib.setLanguage(languageCache.get(data.get("language")));
                lib.setCurrentVersion((String) data.get("current_version"));
                lib.setPackageName((String) data.get("package_name"));
                lib.setPackageManager((String) data.get("package_manager"));
                lib.setUrl((String) data.get("url"));
                if (lib.getCategory() != null && lib.getLanguage() != null) {
                    libraryRepository.save(lib);
                }
            }
        });
    }

    private void initializeDeployments() throws IOException {
        log.info("Initializing deployments...");
        loadJsonConfig("classpath:config/deployments.json", new TypeReference<List<Map<String, Object>>>() {
        }).forEach(data -> {
            Service service = serviceCache.get(data.get("service"));
            Server server = serverCache.get(data.get("hostname"));
            if (service != null && server != null) {
                if (deploymentRepository.findByServiceAndEnvironment(service, server.getEnvironmentType()).isEmpty()) {
                    Deployment d = new Deployment();
                    d.setService(service);
                    d.setServer(server);
                    d.setEnvironment(server.getEnvironmentType());
                    d.setVersion((String) data.get("version"));
                    d.setStatus((String) data.get("status"));
                    d.setPort((Integer) data.get("port"));
                    d.setContextPath((String) data.get("contextPath"));
                    deploymentRepository.save(d);
                }
            }
        });
    }

    private void initializeServiceDependencies() throws IOException {
        log.info("Initializing service dependencies...");
    }

    private <T> T loadJsonConfig(String resourcePath, TypeReference<T> typeRef) throws IOException {
        Resource resource = resourceLoader.getResource(resourcePath);
        try (InputStream inputStream = resource.getInputStream()) {
            return objectMapper.readValue(inputStream, typeRef);
        }
    }

    private void validateDataCounts() {
        log.info("Current Data Counts:");
        log.info("Frameworks: {}", frameworkRepository.count());
        log.info("Services: {}", serviceRepository.count());
        log.info("Servers: {}", serverRepository.count());
        log.info("Deployments: {}", deploymentRepository.count());
    }
}
