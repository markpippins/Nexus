package com.angrysurfer.spring.nexus.controller;

import com.angrysurfer.spring.nexus.client.ServicesConsoleClient;
import com.angrysurfer.spring.nexus.entity.ServiceDependency;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;

import java.util.List;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

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

        Page<ServiceDependency> result = controller.getAllDependencies(PageRequest.of(0, 10));

        assertNotNull(result);
        verify(client).getServiceDependencies();
    }

    @Test
    void getAllDependencies_Empty() {
        when(client.getServiceDependencies()).thenReturn(List.of());

        Page<ServiceDependency> result = controller.getAllDependencies(PageRequest.of(0, 10));

        assertNotNull(result);
        assertEquals(0, result.getContent().size());
    }
}
