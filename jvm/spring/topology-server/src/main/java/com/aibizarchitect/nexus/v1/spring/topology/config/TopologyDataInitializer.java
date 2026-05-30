package com.aibizarchitect.nexus.v1.spring.topology.config;

import com.aibizarchitect.nexus.v1.spring.topology.entity.BrokerProfile;
import com.aibizarchitect.nexus.v1.spring.topology.entity.HostProfile;
import com.aibizarchitect.nexus.v1.spring.topology.repository.BrokerProfileRepository;
import com.aibizarchitect.nexus.v1.spring.topology.repository.HostProfileRepository;
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
    private final HostProfileRepository hostProfileRepository;
    private final ObjectMapper objectMapper;

    public TopologyDataInitializer(BrokerProfileRepository brokerProfileRepository,
                                   HostProfileRepository hostProfileRepository,
                                   ObjectMapper objectMapper) {
        this.brokerProfileRepository = brokerProfileRepository;
        this.hostProfileRepository = hostProfileRepository;
        this.objectMapper = objectMapper;
    }

    @Override
    public void run(String... args) throws Exception {
        seedBrokerProfiles();
        seedHostProfiles();
    }

    private void seedBrokerProfiles() throws Exception {
        if (brokerProfileRepository.count() > 0) {
            return;
        }

        try (InputStream is = new ClassPathResource("config/broker-profiles.json").getInputStream()) {
            List<BrokerProfile> profiles = objectMapper.readValue(is, new TypeReference<List<BrokerProfile>>() {});
            brokerProfileRepository.saveAll(profiles);
            System.out.println("Seeded " + profiles.size() + " broker profile(s)");
        }
    }

    private void seedHostProfiles() throws Exception {
        if (hostProfileRepository.count() > 0) {
            return;
        }

        try (InputStream is = new ClassPathResource("config/host-profiles.json").getInputStream()) {
            List<HostProfile> profiles = objectMapper.readValue(is, new TypeReference<List<HostProfile>>() {});
            hostProfileRepository.saveAll(profiles);
            System.out.println("Seeded " + profiles.size() + " host profile(s)");
        }
    }
}
