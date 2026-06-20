package com.aibizarchitect.nexus.v1.spring.topology.config;

import com.aibizarchitect.nexus.v1.spring.topology.entity.*;
import com.aibizarchitect.nexus.v1.spring.topology.repository.*;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.boot.CommandLineRunner;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Component;

import java.io.InputStream;
import java.util.List;

@Component
public class TopologyDataInitializer implements CommandLineRunner {

    private final BrokerProfileRepository brokerProfileRepository;
    private final RegistryServerProfileRepository registryServerProfileRepository;
    private final ServiceTypeRepository serviceTypeRepository;
    private final ServerRepository serverRepository;
    private final McpServerRepository mcpServerRepository;
    private final RunnableServiceRepository runnableServiceRepository;
    private final ServiceDependencyRepository serviceDependencyRepository;
    private final CliToolRepository cliToolRepository;
    private final ObjectMapper objectMapper;

    private static final String SERVICE_TYPES_PATH = "config/service-types.json";
    private static final String SERVERS_PATH = "config/servers.json";
    private static final String MCP_SERVERS_PATH = "config/mcp-servers.json";
    private static final String RUNNABLE_SERVICES_PATH = "config/runnable-services.json";
    private static final String SERVICE_DEPENDENCIES_PATH = "config/service-dependencies.json";
    private static final String CLI_TOOLS_PATH = "config/cli-tools.json";

    private static boolean reInitialize = true;

    public TopologyDataInitializer(BrokerProfileRepository brokerProfileRepository,
                                    RegistryServerProfileRepository registryServerProfileRepository,
                                    ServiceTypeRepository serviceTypeRepository,
                                    ServerRepository serverRepository,
                                    McpServerRepository mcpServerRepository,
                                    RunnableServiceRepository runnableServiceRepository,
                                    ServiceDependencyRepository serviceDependencyRepository,
                                    CliToolRepository cliToolRepository,
                                    ObjectMapper objectMapper) {
        this.brokerProfileRepository = brokerProfileRepository;
        this.registryServerProfileRepository = registryServerProfileRepository;
        this.serviceTypeRepository = serviceTypeRepository;
        this.serverRepository = serverRepository;
        this.mcpServerRepository = mcpServerRepository;
        this.runnableServiceRepository = runnableServiceRepository;
        this.serviceDependencyRepository = serviceDependencyRepository;
        this.cliToolRepository = cliToolRepository;
        this.objectMapper = objectMapper;
    }

    @Override
    public void run(String... args) throws Exception {
        seedServiceTypes();
        seedServers();
        seedMcpServers();
        seedRunnableServices();
        seedServiceDependencies();
        seedBrokerProfiles();
        seedRegistryServerProfiles();
        seedCliTools();
    }

    private void seedServiceTypes() throws Exception {
        if (reInitialize && serviceTypeRepository.count() > 0) {
            serviceTypeRepository.deleteAll();
        }
        if (serviceTypeRepository.count() > 0) {
            return;
        }
        try (InputStream is = new ClassPathResource(SERVICE_TYPES_PATH).getInputStream()) {
            List<ServiceType> types = objectMapper.readValue(is, new TypeReference<List<ServiceType>>() {});
            serviceTypeRepository.saveAll(types);
            System.out.println("Seeded " + types.size() + " service type(s)");
        }
    }

    private void seedServers() throws Exception {
        if (reInitialize && serverRepository.count() > 0) {
            serverRepository.deleteAll();
        }
        if (serverRepository.count() > 0) {
            return;
        }
        try (InputStream is = new ClassPathResource(SERVERS_PATH).getInputStream()) {
            List<Server> servers = objectMapper.readValue(is, new TypeReference<List<Server>>() {});
            serverRepository.saveAll(servers);
            System.out.println("Seeded " + servers.size() + " server(s)");
        }
    }

    private void seedMcpServers() throws Exception {
        if (reInitialize && mcpServerRepository.count() > 0) {
            mcpServerRepository.deleteAll();
        }
        if (mcpServerRepository.count() > 0) {
            return;
        }
        try (InputStream is = new ClassPathResource(MCP_SERVERS_PATH).getInputStream()) {
            List<McpServer> servers = objectMapper.readValue(is, new TypeReference<List<McpServer>>() {});
            mcpServerRepository.saveAll(servers);
            System.out.println("Seeded " + servers.size() + " MCP server(s)");
        }
    }

    private void seedRunnableServices() throws Exception {
        if (reInitialize && runnableServiceRepository.count() > 0) {
            runnableServiceRepository.deleteAll();
        }
        if (runnableServiceRepository.count() > 0) {
            return;
        }
        try (InputStream is = new ClassPathResource(RUNNABLE_SERVICES_PATH).getInputStream()) {
            List<RunnableService> services = objectMapper.readValue(is, new TypeReference<List<RunnableService>>() {});
            runnableServiceRepository.saveAll(services);
            System.out.println("Seeded " + services.size() + " runnable service(s)");
        }
    }

    private void seedServiceDependencies() throws Exception {
        // Service dependencies reference specific IDs that vary across environments.
        // Seed data is skipped — dependencies should be created via the REST API
        // after service types, MCP servers, and runnable services are registered.
        if (serviceDependencyRepository.count() > 0) {
            return;
        }
        System.out.println("Skipped service dependency seeding (IDs are environment-specific)");
    }

    private void seedCliTools() throws Exception {
        if (reInitialize && cliToolRepository.count() > 0) {
            cliToolRepository.deleteAll();
        }
        if (cliToolRepository.count() > 0) {
            return;
        }
        try (InputStream is = new ClassPathResource(CLI_TOOLS_PATH).getInputStream()) {
            List<CliTool> tools = objectMapper.readValue(is, new TypeReference<List<CliTool>>() {});
            cliToolRepository.saveAll(tools);
            System.out.println("Seeded " + tools.size() + " CLI tool(s)");
        }
    }

    private void seedBrokerProfiles() throws Exception {
        if (reInitialize && brokerProfileRepository.count() > 0) {
            brokerProfileRepository.deleteAll();
        }
        if (brokerProfileRepository.count() > 0) {
            return;
        }
        try (InputStream is = new ClassPathResource("config/broker-profiles.json").getInputStream()) {
            List<BrokerProfile> profiles = objectMapper.readValue(is, new TypeReference<List<BrokerProfile>>() {});
            brokerProfileRepository.saveAll(profiles);
            System.out.println("Seeded " + profiles.size() + " broker profile(s)");
        }
    }

    private void seedRegistryServerProfiles() throws Exception {
        if (reInitialize && registryServerProfileRepository.count() > 0) {
            registryServerProfileRepository.deleteAll();
        }
        if (registryServerProfileRepository.count() > 0) {
            return;
        }
        try (InputStream is = new ClassPathResource("config/registry-server-profiles.json").getInputStream()) {
            List<RegistryServerProfile> profiles = objectMapper.readValue(is, new TypeReference<List<RegistryServerProfile>>() {});
            registryServerProfileRepository.saveAll(profiles);
            System.out.println("Seeded " + profiles.size() + " registry server profile(s)");
        }
    }
}
