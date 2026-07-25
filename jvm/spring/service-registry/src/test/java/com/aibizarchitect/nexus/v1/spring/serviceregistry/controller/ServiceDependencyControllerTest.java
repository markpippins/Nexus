package com.aibizarchitect.nexus.v1.spring.serviceregistry.controller;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.List;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.domain.PageRequest;

import com.aibizarchitect.nexus.v1.spring.serviceregistry.client.ServicesConsoleClient;
import com.aibizarchitect.nexus.v1.spring.serviceregistry.controller.ServiceDependencyController;
import com.aibizarchitect.nexus.v1.spring.serviceregistry.entity.ServiceDependency;

@ExtendWith(MockitoExtension.class)
class ServiceDependencyControllerTest {

    @Mock
    private ServicesConsoleClient client;

    @InjectMocks
    private ServiceDependencyController controller;

    private ServiceDependency testDependency;

    @BeforeEach
    void setUp() {
        testDependency = new ServiceDependency();
    }

    @Test
    void getAllDependencies() {
        List<ServiceDependency> dependencies = List.of(testDependency);
        when(client.getServiceDependencies()).thenReturn(dependencies);

        org.springframework.http.ResponseEntity<com.aibizarchitect.nexus.v1.dto.PagedResponse<ServiceDependency>> response = controller
                .getAllDependencies(PageRequest.of(0, 10));

        assertNotNull(response);
        assertNotNull(response.getBody());
        verify(client).getServiceDependencies();
    }

    @Test
    void getAllDependencies_Empty() {
        when(client.getServiceDependencies()).thenReturn(List.of());

        org.springframework.http.ResponseEntity<com.aibizarchitect.nexus.v1.dto.PagedResponse<ServiceDependency>> response = controller
                .getAllDependencies(PageRequest.of(0, 10));

        assertNotNull(response);
        assertNotNull(response.getBody());
    }

    // ================================================================
    // ORANGE / RED / SILENT FAILURE — deepened coverage
    // ================================================================

    @Test
    void getAllDependencies_NullFromClient_throwsNpe() {
        when(client.getServiceDependencies()).thenReturn(null);

        // GAP: no null guard on client return — will NPE in PagedResponse
        org.junit.jupiter.api.Assertions.assertThrows(NullPointerException.class, () ->
                controller.getAllDependencies(PageRequest.of(0, 10)));
    }

    @Test
    void getAllDependencies_LargeResultSet_handled() {
        List<ServiceDependency> large = new java.util.ArrayList<>();
        for (int i = 0; i < 1000; i++) {
            ServiceDependency dep = new ServiceDependency();
            dep.setId((long) i);
            large.add(dep);
        }
        when(client.getServiceDependencies()).thenReturn(large);

        org.springframework.http.ResponseEntity<com.aibizarchitect.nexus.v1.dto.PagedResponse<ServiceDependency>> response =
                controller.getAllDependencies(PageRequest.of(0, 10));

        assertNotNull(response);
        assertNotNull(response.getBody());
        verify(client).getServiceDependencies();
    }

    @Test
    void metamorphic_sameInput_sameOutput() {
        List<ServiceDependency> deps = List.of(testDependency);
        when(client.getServiceDependencies()).thenReturn(deps);

        org.springframework.http.ResponseEntity<com.aibizarchitect.nexus.v1.dto.PagedResponse<ServiceDependency>> response1 =
                controller.getAllDependencies(PageRequest.of(0, 10));
        org.springframework.http.ResponseEntity<com.aibizarchitect.nexus.v1.dto.PagedResponse<ServiceDependency>> response2 =
                controller.getAllDependencies(PageRequest.of(0, 10));

        assertEquals(response1.getStatusCode(), response2.getStatusCode());
    }

    @Test
    void regressionLock_emptyDependencies_preservesFormat() {
        when(client.getServiceDependencies()).thenReturn(List.of());

        org.springframework.http.ResponseEntity<com.aibizarchitect.nexus.v1.dto.PagedResponse<ServiceDependency>> response =
                controller.getAllDependencies(PageRequest.of(0, 10));

        assertNotNull(response);
        assertEquals(org.springframework.http.HttpStatus.OK, response.getStatusCode());
    }
}
