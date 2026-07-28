package com.aibizarchitect.nexus.v1.spring.serviceregistry.controller;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doNothing;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.List;
import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.Import;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.Pageable;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import com.aibizarchitect.nexus.v1.spring.serviceregistry.config.TestJpaConfig;
import com.aibizarchitect.nexus.v1.spring.serviceregistry.controller.ConfigurationController;
import com.aibizarchitect.nexus.v1.spring.serviceregistry.entity.ServiceConfiguration;
import com.aibizarchitect.nexus.v1.spring.serviceregistry.repository.ServiceConfigurationRepository;

@WebMvcTest(ConfigurationController.class)
@Import(TestJpaConfig.class)
class ConfigurationControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @MockBean
    private ServiceConfigurationRepository configurationRepository;

    private ServiceConfiguration testConfiguration;

    @BeforeEach
    void setUp() {
        testConfiguration = new ServiceConfiguration();
        testConfiguration.setId(1L);
        testConfiguration.setConfigKey("app.name");
        testConfiguration.setConfigValue("Test App");
        testConfiguration.setServiceId(1L);
        testConfiguration.setEnvironmentId(1L);
    }

    @Test
    void getConfigurations_ByAllParams_Found() throws Exception {
        when(configurationRepository.findByServiceIdAndConfigKeyAndEnvironmentId(1L, "app.name", 1L))
                .thenReturn(Optional.of(testConfiguration));

        mockMvc.perform(get("/api/v1/configurations")
                .param("serviceId", "1")
                .param("environmentId", "1")
                .param("configKey", "app.name"))
                .andExpect(status().isOk());
    }

    @Test
    void getConfigurations_ByAllParams_NotFound() throws Exception {
        when(configurationRepository.findByServiceIdAndConfigKeyAndEnvironmentId(1L, "app.name", 1L))
                .thenReturn(Optional.empty());

        mockMvc.perform(get("/api/v1/configurations")
                .param("serviceId", "1")
                .param("environmentId", "1")
                .param("configKey", "app.name"))
                .andExpect(status().isNotFound());
    }

    @Test
    void getConfigurations_ByServiceAndEnvironment() throws Exception {
        Page<ServiceConfiguration> configPage = new PageImpl<>(List.of(testConfiguration));
        when(configurationRepository.findByServiceIdAndEnvironmentId(eq(1L), eq(1L), any(Pageable.class)))
                .thenReturn(configPage);

        mockMvc.perform(get("/api/v1/configurations")
                .param("serviceId", "1")
                .param("environmentId", "1"))
                .andExpect(status().isOk());
    }

    @Test
    void getConfigurations_ByServiceId() throws Exception {
        Page<ServiceConfiguration> configPage = new PageImpl<>(List.of(testConfiguration));
        when(configurationRepository.findByServiceId(eq(1L), any(Pageable.class))).thenReturn(configPage);

        mockMvc.perform(get("/api/v1/configurations")
                .param("serviceId", "1"))
                .andExpect(status().isOk());
    }

    @Test
    void getConfigurations_All() throws Exception {
        Page<ServiceConfiguration> configPage = new PageImpl<>(List.of(testConfiguration));
        when(configurationRepository.findAll(any(Pageable.class))).thenReturn(configPage);

        mockMvc.perform(get("/api/v1/configurations"))
                .andExpect(status().isOk());
    }

    @Test
    void getConfigurationById_Found() throws Exception {
        when(configurationRepository.findById(1L)).thenReturn(Optional.of(testConfiguration));

        mockMvc.perform(get("/api/v1/configurations/1"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(1))
                .andExpect(jsonPath("$.configKey").value("app.name"));
    }

    @Test
    void getConfigurationById_NotFound() throws Exception {
        when(configurationRepository.findById(1L)).thenReturn(Optional.empty());

        mockMvc.perform(get("/api/v1/configurations/1"))
                .andExpect(status().isNotFound());
    }

    @Test
    void createConfiguration_Success() throws Exception {
        when(configurationRepository.save(any(ServiceConfiguration.class))).thenReturn(testConfiguration);

        mockMvc.perform(post("/api/v1/configurations")
                .contentType(MediaType.APPLICATION_JSON)
                .content(
                        "{\"configKey\":\"app.name\",\"configValue\":\"Test App\",\"serviceId\":1,\"environmentId\":1}"))
                .andExpect(status().isCreated());
    }

    @Test
    void updateConfiguration_Success() throws Exception {
        ServiceConfiguration existingConfig = new ServiceConfiguration();
        existingConfig.setId(1L);
        existingConfig.setConfigKey("old.key");

        when(configurationRepository.findById(1L)).thenReturn(Optional.of(existingConfig));
        when(configurationRepository.save(any(ServiceConfiguration.class))).thenReturn(existingConfig);

        mockMvc.perform(put("/api/v1/configurations/1")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"configKey\":\"new.key\",\"configValue\":\"new.value\"}"))
                .andExpect(status().isOk());
    }

    @Test
    void updateConfiguration_NotFound() throws Exception {
        when(configurationRepository.findById(1L)).thenReturn(Optional.empty());

        mockMvc.perform(put("/api/v1/configurations/1")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"configKey\":\"new.key\"}"))
                .andExpect(status().isNotFound());
    }

    @Test
    void deleteConfiguration_Success() throws Exception {
        when(configurationRepository.findById(1L)).thenReturn(Optional.of(testConfiguration));
        doNothing().when(configurationRepository).delete(any(ServiceConfiguration.class));

        mockMvc.perform(delete("/api/v1/configurations/1"))
                .andExpect(status().isNoContent());
    }

    @Test
    void deleteConfiguration_NotFound() throws Exception {
        when(configurationRepository.findById(1L)).thenReturn(Optional.empty());

        mockMvc.perform(delete("/api/v1/configurations/1"))
                .andExpect(status().isNotFound());
    }

    // ================================================================
    // ORANGE PATH — expected, handled failure
    // ================================================================

    @Test
    void createConfiguration_MalformedJson_returns400() throws Exception {
        mockMvc.perform(post("/api/v1/configurations")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{bad json"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void createConfiguration_MissingConfigKey_throwsDataIntegrityViolation() {
        when(configurationRepository.save(any(ServiceConfiguration.class)))
                .thenThrow(new org.springframework.dao.DataIntegrityViolationException("not-null constraint"));

        org.junit.jupiter.api.Assertions.assertThrows(Exception.class, () ->
                mockMvc.perform(post("/api/v1/configurations")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"configValue\":\"value\",\"serviceId\":1}")));
    }

    @Test
    void getConfigurations_InvalidServiceIdType_returns400() throws Exception {
        mockMvc.perform(get("/api/v1/configurations").param("serviceId", "abc"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void updateConfiguration_EmptyConfigKey_handled() throws Exception {
        ServiceConfiguration existing = new ServiceConfiguration();
        existing.setId(1L);
        existing.setConfigKey("old.key");

        when(configurationRepository.findById(1L)).thenReturn(Optional.of(existing));
        when(configurationRepository.save(any(ServiceConfiguration.class))).thenReturn(existing);

        mockMvc.perform(put("/api/v1/configurations/1")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"configKey\":\"\",\"configValue\":\"value\"}"))
                .andExpect(status().isOk());
    }

    // ================================================================
    // RED PATH — adversarial input the system must survive
    // ================================================================

    @Test
    void getConfigurations_SqlInjectionInConfigKey_returnsNotFound() throws Exception {
        when(configurationRepository.findByServiceIdAndConfigKeyAndEnvironmentId(
                1L, "'; DROP TABLE configurations; --", 1L))
                .thenReturn(Optional.empty());

        mockMvc.perform(get("/api/v1/configurations")
                .param("serviceId", "1")
                .param("environmentId", "1")
                .param("configKey", "'; DROP TABLE configurations; --"))
                .andExpect(status().isNotFound());
    }

    @Test
    void createConfiguration_ExtremelyLongConfigKey_handled() throws Exception {
        String longKey = "key.".repeat(200);
        when(configurationRepository.save(any(ServiceConfiguration.class))).thenReturn(testConfiguration);

        mockMvc.perform(post("/api/v1/configurations")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"configKey\":\"" + longKey + "\",\"configValue\":\"value\",\"serviceId\":1}"))
                .andExpect(status().isCreated());
    }

    // ================================================================
    // SILENT FAILURE — metamorphic/determinism coverage
    // ================================================================

    @Test
    void metamorphic_getByIdSameInput_producesSameOutput() throws Exception {
        when(configurationRepository.findById(1L)).thenReturn(Optional.of(testConfiguration));

        String response1 = mockMvc.perform(get("/api/v1/configurations/1"))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();

        String response2 = mockMvc.perform(get("/api/v1/configurations/1"))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();

        assertEquals(response1, response2, "Same config should produce identical JSON");
    }

    @Test
    void metamorphic_differentConfigs_produceDifferentOutput() throws Exception {
        ServiceConfiguration other = new ServiceConfiguration();
        other.setId(2L);
        other.setConfigKey("other.key");
        other.setConfigValue("other.value");

        when(configurationRepository.findById(1L)).thenReturn(Optional.of(testConfiguration));
        when(configurationRepository.findById(2L)).thenReturn(Optional.of(other));

        String response1 = mockMvc.perform(get("/api/v1/configurations/1"))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();

        String response2 = mockMvc.perform(get("/api/v1/configurations/2"))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();

        assertNotEquals(response1, response2, "Different configs MUST produce different JSON");
    }

    @Test
    void regressionLock_notFound_emptyBody() throws Exception {
        when(configurationRepository.findById(1L)).thenReturn(Optional.empty());

        String body = mockMvc.perform(get("/api/v1/configurations/1"))
                .andExpect(status().isNotFound())
                .andReturn().getResponse().getContentAsString();

        assertEquals("", body, "404 responses currently empty — regression lock");
    }
}
