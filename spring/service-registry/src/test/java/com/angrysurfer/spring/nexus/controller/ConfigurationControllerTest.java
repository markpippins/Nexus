package com.angrysurfer.spring.nexus.controller;

import com.angrysurfer.spring.nexus.entity.ServiceConfiguration;
import com.angrysurfer.spring.nexus.repository.ServiceConfigurationRepository;
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
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;

import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class ConfigurationControllerTest {

    @Mock
    private ServiceConfigurationRepository configurationRepository;

    @InjectMocks
    private ConfigurationController configurationController;

    private ServiceConfiguration testConfiguration;

    @BeforeEach
    void setUp() {
        org.springframework.mock.web.MockHttpServletRequest request = new org.springframework.mock.web.MockHttpServletRequest();
        org.springframework.web.context.request.RequestContextHolder.setRequestAttributes(new org.springframework.web.context.request.ServletRequestAttributes(request));
        testConfiguration = new ServiceConfiguration();
        testConfiguration.setId(1L);
        testConfiguration.setConfigKey("app.name");
        testConfiguration.setConfigValue("Test App");
        testConfiguration.setServiceId(1L);
        testConfiguration.setEnvironmentId(1L);
    }

    @Test
    void getConfigurations_ByAllParams_Found() {
        when(configurationRepository.findByServiceIdAndConfigKeyAndEnvironmentId(1L, "app.name", 1L))
                .thenReturn(Optional.of(testConfiguration));

        ResponseEntity<?> response = configurationController.getConfigurations(1L, 1L, "app.name", PageRequest.of(0, 10));

        assertEquals(HttpStatus.OK, response.getStatusCode());
        assertEquals(testConfiguration, response.getBody());
    }

    @Test
    void getConfigurations_ByAllParams_NotFound() {
        when(configurationRepository.findByServiceIdAndConfigKeyAndEnvironmentId(1L, "app.name", 1L))
                .thenReturn(Optional.empty());

        ResponseEntity<?> response = configurationController.getConfigurations(1L, 1L, "app.name", PageRequest.of(0, 10));

        assertEquals(HttpStatus.NOT_FOUND, response.getStatusCode());
    }

    @Test
    void getConfigurations_ByServiceAndEnvironment() {
        Page<ServiceConfiguration> configPage = new PageImpl<>(List.of(testConfiguration));
        when(configurationRepository.findByServiceIdAndEnvironmentId(eq(1L), eq(1L), any(Pageable.class)))
                .thenReturn(configPage);

        ResponseEntity<?> response = configurationController.getConfigurations(1L, 1L, null, PageRequest.of(0, 10));

        assertEquals(HttpStatus.OK, response.getStatusCode());
    }

    @Test
    void getConfigurations_ByServiceId() {
        Page<ServiceConfiguration> configPage = new PageImpl<>(List.of(testConfiguration));
        when(configurationRepository.findByServiceId(eq(1L), any(Pageable.class))).thenReturn(configPage);

        ResponseEntity<?> response = configurationController.getConfigurations(1L, null, null, PageRequest.of(0, 10));

        assertEquals(HttpStatus.OK, response.getStatusCode());
    }

    @Test
    void getConfigurations_All() {
        Page<ServiceConfiguration> configPage = new PageImpl<>(List.of(testConfiguration));
        when(configurationRepository.findAll(any(Pageable.class))).thenReturn(configPage);

        ResponseEntity<?> response = configurationController.getConfigurations(null, null, null, PageRequest.of(0, 10));

        assertEquals(HttpStatus.OK, response.getStatusCode());
    }

    @Test
    void getConfigurationById_Found() {
        when(configurationRepository.findById(1L)).thenReturn(Optional.of(testConfiguration));

        ResponseEntity<ServiceConfiguration> response = configurationController.getConfigurationById(1L);

        assertEquals(HttpStatus.OK, response.getStatusCode());
        assertEquals(testConfiguration, response.getBody());
    }

    @Test
    void getConfigurationById_NotFound() {
        when(configurationRepository.findById(1L)).thenReturn(Optional.empty());

        ResponseEntity<ServiceConfiguration> response = configurationController.getConfigurationById(1L);

        assertEquals(HttpStatus.NOT_FOUND, response.getStatusCode());
    }

    @Test
    void createConfiguration_Success() {
        when(configurationRepository.save(any(ServiceConfiguration.class))).thenReturn(testConfiguration);

        ResponseEntity<ServiceConfiguration> response = configurationController.createConfiguration(testConfiguration);

        assertEquals(HttpStatus.CREATED, response.getStatusCode());
        assertNotNull(response.getBody());
        verify(configurationRepository).save(any(ServiceConfiguration.class));
    }

    @Test
    void updateConfiguration_Success() {
        ServiceConfiguration existingConfig = new ServiceConfiguration();
        existingConfig.setId(1L);
        existingConfig.setConfigKey("old.key");

        ServiceConfiguration updatedConfig = new ServiceConfiguration();
        updatedConfig.setConfigKey("new.key");
        updatedConfig.setConfigValue("new.value");

        when(configurationRepository.findById(1L)).thenReturn(Optional.of(existingConfig));
        when(configurationRepository.save(any(ServiceConfiguration.class))).thenReturn(updatedConfig);

        ResponseEntity<ServiceConfiguration> response = configurationController.updateConfiguration(1L, updatedConfig);

        assertEquals(HttpStatus.OK, response.getStatusCode());
        verify(configurationRepository).save(any(ServiceConfiguration.class));
    }

    @Test
    void updateConfiguration_NotFound() {
        when(configurationRepository.findById(1L)).thenReturn(Optional.empty());

        ResponseEntity<ServiceConfiguration> response = configurationController.updateConfiguration(1L, testConfiguration);

        assertEquals(HttpStatus.NOT_FOUND, response.getStatusCode());
        verify(configurationRepository, never()).save(any(ServiceConfiguration.class));
    }

    @Test
    void deleteConfiguration_Success() {
        when(configurationRepository.findById(1L)).thenReturn(Optional.of(testConfiguration));
        doNothing().when(configurationRepository).delete(any(ServiceConfiguration.class));

        ResponseEntity<Void> response = configurationController.deleteConfiguration(1L);

        assertEquals(HttpStatus.NO_CONTENT, response.getStatusCode());
        verify(configurationRepository).delete(any(ServiceConfiguration.class));
    }

    @Test
    void deleteConfiguration_NotFound() {
        when(configurationRepository.findById(1L)).thenReturn(Optional.empty());

        ResponseEntity<Void> response = configurationController.deleteConfiguration(1L);

        assertEquals(HttpStatus.NOT_FOUND, response.getStatusCode());
        verify(configurationRepository, never()).delete(any(ServiceConfiguration.class));
    }
}
