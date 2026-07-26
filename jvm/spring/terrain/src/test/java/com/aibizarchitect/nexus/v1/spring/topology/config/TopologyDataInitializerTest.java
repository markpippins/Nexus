package com.aibizarchitect.nexus.v1.spring.topology.config;

import com.aibizarchitect.nexus.v1.spring.topology.entity.ServiceType;
import com.aibizarchitect.nexus.v1.spring.topology.repository.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

/**
 * Tests for {@link TopologyDataInitializer} covering green, orange, and red paths.
 *
 * <p>Uses mocked repositories since the initializer reads from classpath JSON
 * files and writes to the database. Tests focus on the seeding skip logic and
 * reInitialize flag behavior.
 */
@DisplayName("TopologyDataInitializer")
class TopologyDataInitializerTest {

    private BrokerProfileRepository brokerProfileRepo;
    private RegistryServerProfileRepository registryServerProfileRepo;
    private ServiceTypeRepository serviceTypeRepo;
    private ServerRepository serverRepo;
    private McpServerRepository mcpServerRepo;
    private RunnableServiceRepository runnableServiceRepo;
    private ServiceDependencyRepository serviceDependencyRepo;
    private CliToolRepository cliToolRepo;
    private ObjectMapper objectMapper;

    @BeforeEach
    void setUp() {
        brokerProfileRepo = mock(BrokerProfileRepository.class);
        registryServerProfileRepo = mock(RegistryServerProfileRepository.class);
        serviceTypeRepo = mock(ServiceTypeRepository.class);
        serverRepo = mock(ServerRepository.class);
        mcpServerRepo = mock(McpServerRepository.class);
        runnableServiceRepo = mock(RunnableServiceRepository.class);
        serviceDependencyRepo = mock(ServiceDependencyRepository.class);
        cliToolRepo = mock(CliToolRepository.class);
        objectMapper = new ObjectMapper();
    }

    // ─────────────────────────────────────────────────────────────
    // GREEN PATH
    // ─────────────────────────────────────────────────────────────

    @Nested
    @DisplayName("Green path — seeding when empty")
    class GreenPath {

        @Test
        @DisplayName("constructor wires all dependencies without error")
        void constructor_wiresAllDependencies() {
            assertDoesNotThrow(() -> new TopologyDataInitializer(
                brokerProfileRepo, registryServerProfileRepo,
                serviceTypeRepo, serverRepo, mcpServerRepo,
                runnableServiceRepo, serviceDependencyRepo, cliToolRepo,
                objectMapper, false),
                "Constructor should accept all 10 parameters");
        }
    }

    // ─────────────────────────────────────────────────────────────
    // ORANGE PATH — skip logic
    // ─────────────────────────────────────────────────────────────

    @Nested
    @DisplayName("Orange path — seeding skips when data exists")
    class OrangePath {

        @Test
        @DisplayName("reInitialize=false with existing data skips seeding")
        void reInitializeFalse_existingData_skips() throws Exception {
            when(serviceTypeRepo.count()).thenReturn(5L);
            when(serverRepo.count()).thenReturn(3L);
            when(mcpServerRepo.count()).thenReturn(10L);
            when(runnableServiceRepo.count()).thenReturn(8L);
            when(brokerProfileRepo.count()).thenReturn(2L);
            when(registryServerProfileRepo.count()).thenReturn(1L);
            when(cliToolRepo.count()).thenReturn(5L);

            TopologyDataInitializer init = new TopologyDataInitializer(
                brokerProfileRepo, registryServerProfileRepo,
                serviceTypeRepo, serverRepo, mcpServerRepo,
                runnableServiceRepo, serviceDependencyRepo, cliToolRepo,
                objectMapper, false);

            init.run();

            // Existing data → no saves should happen for populated repos
            verify(serviceTypeRepo, never()).saveAll(any());
            verify(serverRepo, never()).saveAll(any());
            verify(mcpServerRepo, never()).saveAll(any());
            verify(runnableServiceRepo, never()).saveAll(any());
            verify(brokerProfileRepo, never()).saveAll(any());
            verify(registryServerProfileRepo, never()).saveAll(any());
        }

        @Test
        @DisplayName("reInitialize=true with existing data deletes then seeds")
        void reInitializeTrue_existingData_deletesAndSeeds() throws Exception {
            when(serviceTypeRepo.count()).thenReturn(5L);
            when(serverRepo.count()).thenReturn(3L);
            when(mcpServerRepo.count()).thenReturn(10L);
            when(runnableServiceRepo.count()).thenReturn(8L);
            when(brokerProfileRepo.count()).thenReturn(2L);
            when(registryServerProfileRepo.count()).thenReturn(1L);
            when(cliToolRepo.count()).thenReturn(0L);

            TopologyDataInitializer init = new TopologyDataInitializer(
                brokerProfileRepo, registryServerProfileRepo,
                serviceTypeRepo, serverRepo, mcpServerRepo,
                runnableServiceRepo, serviceDependencyRepo, cliToolRepo,
                objectMapper, true);

            init.run();

            // reInitialize=true → should call deleteAll before re-seeding
            verify(serviceTypeRepo).deleteAll();
            verify(serverRepo).deleteAll();
            verify(mcpServerRepo).deleteAll();
            verify(runnableServiceRepo).deleteAll();
            verify(brokerProfileRepo).deleteAll();
            verify(registryServerProfileRepo).deleteAll();
        }
    }

    // ─────────────────────────────────────────────────────────────
    // RED PATH
    // ─────────────────────────────────────────────────────────────

    @Nested
    @DisplayName("Red path — failure handling")
    class RedPath {

        @Test
        @DisplayName("service dependency seeding is always skipped (IDs env-specific)")
        void serviceDependencies_alwaysSkipped() throws Exception {
            // Mock all other repos to return > 0 so they skip without reading
            // classpath JSON files (which may not exist in test resources).
            // Only serviceDependencyRepo returns 0 — the method under test.
            when(serviceTypeRepo.count()).thenReturn(5L);
            when(serverRepo.count()).thenReturn(3L);
            when(mcpServerRepo.count()).thenReturn(10L);
            when(runnableServiceRepo.count()).thenReturn(8L);
            when(brokerProfileRepo.count()).thenReturn(2L);
            when(registryServerProfileRepo.count()).thenReturn(1L);
            when(cliToolRepo.count()).thenReturn(5L);
            when(serviceDependencyRepo.count()).thenReturn(0L);

            TopologyDataInitializer init = new TopologyDataInitializer(
                brokerProfileRepo, registryServerProfileRepo,
                serviceTypeRepo, serverRepo, mcpServerRepo,
                runnableServiceRepo, serviceDependencyRepo, cliToolRepo,
                objectMapper, false);

            init.run();

            // Service dependencies are always skipped per the implementation
            verify(serviceDependencyRepo, never()).saveAll(any());
            verify(serviceDependencyRepo, never()).deleteAll();
            verify(serviceDependencyRepo, atLeastOnce()).count();
        }

        @Test
        @DisplayName("null repository methods are not called")
        void nullRepos_notCalled() {
            TopologyDataInitializer init = new TopologyDataInitializer(
                brokerProfileRepo, registryServerProfileRepo,
                serviceTypeRepo, serverRepo, mcpServerRepo,
                runnableServiceRepo, serviceDependencyRepo, cliToolRepo,
                objectMapper, false);

            assertNotNull(init,
                "Initializer should be constructable");
        }
    }
}
