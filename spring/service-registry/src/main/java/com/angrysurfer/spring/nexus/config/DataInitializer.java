package com.angrysurfer.spring.nexus.config;

import java.io.IOException;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.CommandLineRunner;
import org.springframework.core.io.Resource;
import org.springframework.core.io.ResourceLoader;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import com.angrysurfer.spring.nexus.entity.Deployment;
import com.angrysurfer.spring.nexus.entity.EnvironmentType;
import com.angrysurfer.spring.nexus.entity.Framework;
import com.angrysurfer.spring.nexus.entity.FrameworkCategory;
import com.angrysurfer.spring.nexus.entity.FrameworkLanguage;
import com.angrysurfer.spring.nexus.entity.FrameworkVendor;
import com.angrysurfer.spring.nexus.entity.Host;
import com.angrysurfer.spring.nexus.entity.Library;
import com.angrysurfer.spring.nexus.entity.LibraryCategory;
import com.angrysurfer.spring.nexus.entity.OperatingSystem;
import com.angrysurfer.spring.nexus.entity.ServerType;
import com.angrysurfer.spring.nexus.entity.Service;
import com.angrysurfer.spring.nexus.entity.ServiceConfiguration;
import com.angrysurfer.spring.nexus.entity.ServiceDependency;
import com.angrysurfer.spring.nexus.entity.ServiceType;
import com.angrysurfer.spring.nexus.repository.DeploymentRepository;
import com.angrysurfer.spring.nexus.repository.EnvironmentTypeRepository;
import com.angrysurfer.spring.nexus.repository.FrameworkCategoryRepository;
import com.angrysurfer.spring.nexus.repository.FrameworkLanguageRepository;
import com.angrysurfer.spring.nexus.repository.FrameworkRepository;
import com.angrysurfer.spring.nexus.repository.FrameworkVendorRepository;
import com.angrysurfer.spring.nexus.repository.HostRepository;
import com.angrysurfer.spring.nexus.repository.LibraryCategoryRepository;
import com.angrysurfer.spring.nexus.repository.LibraryRepository;
import com.angrysurfer.spring.nexus.repository.OperatingSystemRepository;
import com.angrysurfer.spring.nexus.repository.ServerTypeRepository;
import com.angrysurfer.spring.nexus.repository.ServiceConfigurationRepository;
import com.angrysurfer.spring.nexus.repository.ServiceDependencyRepository;
import com.angrysurfer.spring.nexus.repository.ServiceRepository;
import com.angrysurfer.spring.nexus.repository.ServiceTypeRepository;
import com.angrysurfer.spring.nexus.service.CacheWarmingService;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;

@Component
public class DataInitializer implements CommandLineRunner {

    private static final Logger log = LoggerFactory.getLogger(DataInitializer.class);

    private final ObjectMapper objectMapper;
    private final ResourceLoader resourceLoader;

    private final ServiceRepository serviceRepository;
    private final FrameworkRepository frameworkRepository;
    private final FrameworkCategoryRepository categoryRepository;
    private final FrameworkLanguageRepository languageRepository;
    private final ServiceTypeRepository serviceTypeRepository;
    private final ServerTypeRepository serverTypeRepository;
    private final EnvironmentTypeRepository environmentTypeRepository;
    private final HostRepository hostRepository;
    private final DeploymentRepository deploymentRepository;
    private final ServiceConfigurationRepository configurationRepository;
    private final ServiceDependencyRepository serviceDependencyRepository;
    private final LibraryCategoryRepository libraryCategoryRepository;
    private final LibraryRepository libraryRepository;
    private final OperatingSystemRepository operatingSystemRepository;
    private final FrameworkVendorRepository frameworkVendorRepository;
    private final CacheWarmingService cacheWarmingService;

    public DataInitializer(ObjectMapper objectMapper, ResourceLoader resourceLoader, ServiceRepository serviceRepository,
            FrameworkRepository frameworkRepository, FrameworkCategoryRepository categoryRepository,
            FrameworkLanguageRepository languageRepository, ServiceTypeRepository serviceTypeRepository,
            ServerTypeRepository serverTypeRepository, EnvironmentTypeRepository environmentTypeRepository,
            HostRepository hostRepository, DeploymentRepository deploymentRepository,
            ServiceConfigurationRepository configurationRepository, ServiceDependencyRepository serviceDependencyRepository,
            LibraryCategoryRepository libraryCategoryRepository, LibraryRepository libraryRepository,
            OperatingSystemRepository operatingSystemRepository, FrameworkVendorRepository frameworkVendorRepository,
            CacheWarmingService cacheWarmingService) {
        this.objectMapper = objectMapper;
        this.resourceLoader = resourceLoader;
        this.serviceRepository = serviceRepository;
        this.frameworkRepository = frameworkRepository;
        this.categoryRepository = categoryRepository;
        this.languageRepository = languageRepository;
        this.serviceTypeRepository = serviceTypeRepository;
        this.serverTypeRepository = serverTypeRepository;
        this.environmentTypeRepository = environmentTypeRepository;
        this.hostRepository = hostRepository;
        this.deploymentRepository = deploymentRepository;
        this.configurationRepository = configurationRepository;
        this.serviceDependencyRepository = serviceDependencyRepository;
        this.libraryCategoryRepository = libraryCategoryRepository;
        this.libraryRepository = libraryRepository;
        this.operatingSystemRepository = operatingSystemRepository;
        this.frameworkVendorRepository = frameworkVendorRepository;
        this.cacheWarmingService = cacheWarmingService;
    }

    // Cache to store lookup entities during initialization
    private final Map<String, FrameworkCategory> categoryCache = new HashMap<>();
    private final Map<String, FrameworkLanguage> languageCache = new HashMap<>();
    private final Map<String, ServiceType> serviceTypeCache = new HashMap<>();
    private final Map<String, ServerType> serverTypeCache = new HashMap<>();
    private final Map<String, EnvironmentType> environmentTypeCache = new HashMap<>();
    private final Map<String, OperatingSystem> osCache = new HashMap<>();
    private final Map<String, FrameworkVendor> vendorCache = new HashMap<>();
    private final Map<String, Framework> frameworkCache = new HashMap<>();
    private final Map<String, Host> hostCache = new HashMap<>();
    private final Map<String, Service> serviceCache = new HashMap<>();
    private final Map<String, LibraryCategory> libraryCategoryCache = new HashMap<>();

    @Override
    @Transactional
    public void run(String... args) {
        log.info("Starting data initialization...");
        try {
            cacheWarmingService.clearAllCaches();

            initializeLookupData();
            initializeFrameworks();
            initializeHosts();
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
            EnvironmentType entity = environmentTypeCache.computeIfAbsent(name, k -> environmentTypeRepository.findByName(name)
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
            ServiceType entity = serviceTypeCache.computeIfAbsent(name, k -> serviceTypeRepository.findByName(name)
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
            ServerType entity = serverTypeCache.computeIfAbsent(name, k -> serverTypeRepository.findByName(name)
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
            OperatingSystem entity = osCache.computeIfAbsent(name, k -> operatingSystemRepository.findByName(name)
                    .orElseGet(() -> {
                        OperatingSystem os = new OperatingSystem();
                        os.setName(name);
                        os.setVersion((String) data.get("version"));
                        os.setArchitecture((String) data.get("architecture"));
                        return operatingSystemRepository.save(os);
                    }));
        });

        // Framework Categories
        loadJsonConfig("classpath:config/framework-categories.json", new TypeReference<List<Map<String, Object>>>() {
        }).forEach(data -> {
            String name = (String) data.get("name");
            FrameworkCategory entity = categoryCache.computeIfAbsent(name, k -> categoryRepository.findByName(name)
                    .orElseGet(() -> {
                        FrameworkCategory fc = new FrameworkCategory();
                        fc.setName(name);
                        fc.setDescription((String) data.get("description"));
                        return categoryRepository.save(fc);
                    }));
        });

        // Framework Languages
        loadJsonConfig("classpath:config/framework-languages.json", new TypeReference<List<Map<String, Object>>>() {
        }).forEach(data -> {
            String name = (String) data.get("name");
            FrameworkLanguage entity = languageCache.computeIfAbsent(name, k -> languageRepository.findByName(name)
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
            FrameworkVendor entity = vendorCache.computeIfAbsent(name, k -> frameworkVendorRepository.findByName(name)
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
                f.setCategory(categoryCache.get(data.get("category")));
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

    private void initializeHosts() throws IOException {
        log.info("Initializing hosts...");
        loadJsonConfig("classpath:config/servers.json", new TypeReference<List<Map<String, Object>>>() {
        }).forEach(data -> {
            String hostname = (String) data.get("hostname");
            Host host = hostCache.computeIfAbsent(hostname, k -> hostRepository.findByHostname(hostname).orElseGet(() -> {
                Host h = new Host();
                h.setHostname(hostname);
                h.setIpAddress((String) data.get("ipAddress"));
                h.setType(serverTypeCache.get(data.get("type")));
                h.setEnvironmentType(environmentTypeCache.get(data.get("environment")));
                h.setOperatingSystem(osCache.get(data.get("operatingSystem")));
                h.setCpuCores((Integer) data.get("cpuCores"));
                h.setMemory((String) data.get("memory"));
                h.setDisk((String) data.get("disk"));
                h.setStatus("ACTIVE");
                if (h.getType() == null || h.getEnvironmentType() == null || h.getOperatingSystem() == null) {
                    log.warn("Skipping host {} due to missing type/env/os", hostname);
                    return null;
                }
                return hostRepository.save(h);
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
        // Categories
        loadJsonConfig("classpath:config/library-categories.json", new TypeReference<List<Map<String, Object>>>() {
        }).forEach(data -> {
            String name = (String) data.get("name");
            LibraryCategory entity = libraryCategoryCache.computeIfAbsent(name, k -> libraryCategoryRepository.findByName(name)
                    .orElseGet(() -> {
                        LibraryCategory lc = new LibraryCategory();
                        lc.setName(name);
                        lc.setDescription((String) data.get("description"));
                        return libraryCategoryRepository.save(lc);
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
                lib.setCategory(libraryCategoryCache.get(data.get("category")));
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
            Host host = hostCache.get(data.get("hostname"));
            if (service != null && host != null) {
                if (deploymentRepository.findByServiceAndEnvironment(service, host.getEnvironmentType()).isEmpty()) {
                    Deployment d = new Deployment();
                    d.setService(service);
                    d.setServer(host);
                    d.setEnvironment(host.getEnvironmentType());
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
        log.info("Hosts: {}", hostRepository.count());
        log.info("Deployments: {}", deploymentRepository.count());
    }
}
