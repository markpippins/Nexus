package nexus.serviceregistry.v1.controller;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.domain.PageRequest;

import nexus.serviceregistry.v1.client.ServicesConsoleClient;
import nexus.serviceregistry.v1.entity.ServiceDependency;

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

        org.springframework.http.ResponseEntity<com.angrysurfer.nexus.dto.PagedResponse<ServiceDependency>> response = controller
                .getAllDependencies(PageRequest.of(0, 10));

        assertNotNull(response);
        assertNotNull(response.getBody());
        verify(client).getServiceDependencies();
    }

    @Test
    void getAllDependencies_Empty() {
        when(client.getServiceDependencies()).thenReturn(List.of());

        org.springframework.http.ResponseEntity<com.angrysurfer.nexus.dto.PagedResponse<ServiceDependency>> response = controller
                .getAllDependencies(PageRequest.of(0, 10));

        assertNotNull(response);
        assertNotNull(response.getBody());
    }
}
