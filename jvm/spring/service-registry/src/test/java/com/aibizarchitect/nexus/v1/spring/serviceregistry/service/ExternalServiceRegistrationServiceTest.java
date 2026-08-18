package com.aibizarchitect.nexus.v1.spring.serviceregistry.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import com.aibizarchitect.nexus.v1.dto.ExternalServiceRegistration;
import com.aibizarchitect.nexus.v1.spring.serviceregistry.entity.Deployment;
import com.aibizarchitect.nexus.v1.spring.serviceregistry.entity.EnvironmentType;
import com.aibizarchitect.nexus.v1.spring.serviceregistry.entity.Server;
import com.aibizarchitect.nexus.v1.spring.serviceregistry.entity.Service;
import com.aibizarchitect.nexus.v1.spring.serviceregistry.entity.ServiceType;
import com.aibizarchitect.nexus.v1.spring.serviceregistry.repository.DeploymentRepository;
import com.aibizarchitect.nexus.v1.spring.serviceregistry.repository.EnvironmentTypeRepository;
import com.aibizarchitect.nexus.v1.spring.serviceregistry.repository.FrameworkLanguageRepository;
import com.aibizarchitect.nexus.v1.spring.serviceregistry.repository.FrameworkRepository;
import com.aibizarchitect.nexus.v1.spring.serviceregistry.repository.FrameworkTypeRepository;
import com.aibizarchitect.nexus.v1.spring.serviceregistry.repository.FrameworkVendorRepository;
import com.aibizarchitect.nexus.v1.spring.serviceregistry.repository.ServerRepository;
import com.aibizarchitect.nexus.v1.spring.serviceregistry.repository.ServiceConfigurationRepository;
import com.aibizarchitect.nexus.v1.spring.serviceregistry.repository.ServiceRepository;
import com.aibizarchitect.nexus.v1.spring.serviceregistry.repository.ServiceTypeRepository;

/**
 * Plan 1291 (registration → deployment bridge): verifies that a registration
 * carrying a serverId/hostname auto-creates or updates a Deployment row
 * linking Service → Server, and that registrations without server identity
 * stay Service-only (backward compatible).
 */
@ExtendWith(MockitoExtension.class)
class ExternalServiceRegistrationServiceTest {

    @Mock
    private ServiceRepository serviceRepository;
    @Mock
    private FrameworkRepository frameworkRepository;
    @Mock
    private FrameworkTypeRepository frameworkTypeRepository;
    @Mock
    private FrameworkLanguageRepository frameworkLanguageRepository;
    @Mock
    private FrameworkVendorRepository frameworkVendorRepository;
    @Mock
    private ServiceTypeRepository serviceTypeRepository;
    @Mock
    private ServiceConfigurationRepository serviceConfigurationRepository;
    @Mock
    private ServerRepository serverRepository;
    @Mock
    private DeploymentRepository deploymentRepository;
    @Mock
    private EnvironmentTypeRepository environmentTypeRepository;

    private ExternalServiceRegistrationService registrationService;

    private Service testService;
    private Server testServer;
    private EnvironmentType testEnv;
    private ServiceType testServiceType;

    @BeforeEach
    void setUp() {
        registrationService = new ExternalServiceRegistrationService(
                serviceRepository, frameworkRepository, frameworkTypeRepository,
                frameworkLanguageRepository, frameworkVendorRepository,
                serviceTypeRepository, serviceConfigurationRepository,
                serverRepository, deploymentRepository, environmentTypeRepository);

        testEnv = new EnvironmentType();
        testEnv.setId(1L);
        testEnv.setName("Development");

        testServer = new Server();
        testServer.setId(7L);
        testServer.setHostname("osmium");
        testServer.setEnvironmentType(testEnv);

        testService = new Service();
        testService.setId(99L);
        testService.setName("svc-bridge-test");
        testService.setDefaultPort(8080);

        testServiceType = new ServiceType();
        testServiceType.setId(1L);
        testServiceType.setName("REST API");

        when(serviceRepository.findByName(anyString())).thenReturn(Optional.of(testService));
        when(serviceRepository.save(any(Service.class))).thenAnswer(inv -> inv.getArgument(0));
        when(serviceTypeRepository.findByName("REST API")).thenReturn(Optional.of(testServiceType));
        // The deployment bridge only fires when a server identity is supplied,
        // so this stub is unused in the Service-only tests — mark it lenient.
        lenient().when(deploymentRepository.save(any(Deployment.class))).thenAnswer(inv -> {
            Deployment d = inv.getArgument(0);
            if (d.getId() == null) {
                d.setId(500L);
            }
            return d;
        });
    }

    @Test
    void register_withServerId_createsDeployment() {
        ExternalServiceRegistration reg = new ExternalServiceRegistration();
        reg.setServiceName("svc-bridge-test");
        reg.setServerId(7L);
        reg.setVersion("1.2.3");
        reg.setPort(9000);

        when(serverRepository.findById(7L)).thenReturn(Optional.of(testServer));
        when(deploymentRepository.findFirstByService_IdAndServer_Id(99L, 7L)).thenReturn(Optional.empty());

        Service result = registrationService.registerExternalService(reg);

        assertNotNull(result);
        ArgumentCaptor<Deployment> captor = ArgumentCaptor.forClass(Deployment.class);
        verify(deploymentRepository).save(captor.capture());
        Deployment saved = captor.getValue();
        assertEquals(testService, saved.getService());
        assertEquals(testServer, saved.getServer());
        assertEquals(testEnv, saved.getEnvironment());
        assertEquals("1.2.3", saved.getVersion());
        assertEquals(9000, saved.getPort());
        assertEquals("RUNNING", saved.getStatus());
        // Health URL is intentionally left null — DeploymentHealthScheduler
        // constructs http://{server.hostname}:{port}/health (remote, not localhost).
        assertNull(saved.getHealthCheckUrl());
    }

    @Test
    void register_withHostname_resolvesServerByHostname() {
        ExternalServiceRegistration reg = new ExternalServiceRegistration();
        reg.setServiceName("svc-bridge-test");
        reg.setHostname("osmium");

        when(serverRepository.findByHostname("osmium")).thenReturn(Optional.of(testServer));
        when(deploymentRepository.findFirstByService_IdAndServer_Id(99L, 7L)).thenReturn(Optional.empty());

        registrationService.registerExternalService(reg);

        ArgumentCaptor<Deployment> captor = ArgumentCaptor.forClass(Deployment.class);
        verify(deploymentRepository).save(captor.capture());
        assertEquals(testServer, captor.getValue().getServer());
    }

    @Test
    void register_withoutServerIdentity_isServiceOnly() {
        ExternalServiceRegistration reg = new ExternalServiceRegistration();
        reg.setServiceName("svc-bridge-test");

        Service result = registrationService.registerExternalService(reg);

        assertNotNull(result);
        verify(deploymentRepository, never()).save(any(Deployment.class));
        verify(serverRepository, never()).findById(anyLong());
        verify(serverRepository, never()).findByHostname(anyString());
    }

    @Test
    void register_resolvesServerByIdPrecedenceOverHostname() {
        ExternalServiceRegistration reg = new ExternalServiceRegistration();
        reg.setServiceName("svc-bridge-test");
        reg.setServerId(7L);
        reg.setHostname("ignored-hostname");

        when(serverRepository.findById(7L)).thenReturn(Optional.of(testServer));
        when(deploymentRepository.findFirstByService_IdAndServer_Id(99L, 7L)).thenReturn(Optional.empty());

        registrationService.registerExternalService(reg);

        verify(serverRepository).findById(7L);
        verify(serverRepository, never()).findByHostname(anyString());
    }

    @Test
    void register_withExistingDeployment_updatesNotDuplicates() {
        ExternalServiceRegistration reg = new ExternalServiceRegistration();
        reg.setServiceName("svc-bridge-test");
        reg.setServerId(7L);
        reg.setVersion("2.0.0");

        Deployment existing = new Deployment();
        existing.setId(500L);
        existing.setService(testService);
        existing.setServer(testServer);
        existing.setEnvironment(testEnv);
        existing.setStatus("RUNNING");
        existing.setVersion("1.0.0");

        when(serverRepository.findById(7L)).thenReturn(Optional.of(testServer));
        when(deploymentRepository.findFirstByService_IdAndServer_Id(99L, 7L)).thenReturn(Optional.of(existing));

        registrationService.registerExternalService(reg);

        verify(deploymentRepository).save(any(Deployment.class));
        assertEquals("2.0.0", existing.getVersion()); // updated in place
        assertEquals(500L, existing.getId());          // same row, no duplicate
    }

    @Test
    void register_withUnresolvableServer_isServiceOnlyWithoutFailure() {
        ExternalServiceRegistration reg = new ExternalServiceRegistration();
        reg.setServiceName("svc-bridge-test");
        reg.setServerId(9999L);

        when(serverRepository.findById(9999L)).thenReturn(Optional.empty());

        Service result = registrationService.registerExternalService(reg);

        assertNotNull(result);
        verify(deploymentRepository, never()).save(any(Deployment.class));
    }
}
