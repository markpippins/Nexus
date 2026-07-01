package com.aibizarchitect.nexus.v1.spring.topology.config;

import com.aibizarchitect.nexus.v1.spring.topology.entity.BrokerProfile;
import com.aibizarchitect.nexus.v1.spring.topology.entity.RegistryServerProfile;
import com.aibizarchitect.nexus.v1.spring.topology.repository.BrokerProfileRepository;
import com.aibizarchitect.nexus.v1.spring.topology.repository.RegistryServerProfileRepository;
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
    private final ObjectMapper objectMapper;

    private static final String BROKER_PROFILES_PATH = "config/broker-profiles.json";
    private static final String REGISTRY_SERVER_PROFILES_PATH = "config/registry-server-profiles.json";

    private static boolean reInitialize = true; // Set to true to re-seed data on every startup, false to seed only if empty
    
    public TopologyDataInitializer(BrokerProfileRepository brokerProfileRepository,
                                    RegistryServerProfileRepository registryServerProfileRepository,
                                    ObjectMapper objectMapper) {
        this.brokerProfileRepository = brokerProfileRepository;
        this.registryServerProfileRepository = registryServerProfileRepository;
        this.objectMapper = objectMapper;
    }

    @Override
    public void run(String... args) throws Exception {
        seedBrokerProfiles();
        seedRegistryServerProfiles();
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
