package org.nexus.peb.api.controller;

import org.nexus.peb.bootstrap.PebApplication;
import org.nexus.peb.core.engine.PebGovernanceEngine;
import org.nexus.peb.domain.exception.MalformedAdmissionRequestException;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Integration slice covering the JSON deserialization of
 * {@link org.nexus.peb.domain.entity.PebTransaction} requests and the typed
 * {@code @ExceptionHandler(MalformedAdmissionRequestException.class) -> 422}
 * mapping on {@link AdmissionControllerFacade}.
 *
 * <p>Uses {@link SpringBootTest} (not {@code @WebMvcTest}) because
 * PebApplication's package is {@code org.nexus.peb.bootstrap} while the
 * controller is in {@code org.nexus.peb.api.controller} — a sibling
 * package that {@code @WebMvcTest}'s auto-scan cannot reach.
 * {@code @SpringBootTest} with {@code webEnvironment = MOCK} together
 * with {@code @AutoConfigureMockMvc} gives the same MockMvc behavior
 * with the full application context on the classpath.
 *
 * <p>The datasource connects directly to the running pgvector PostgreSQL
 * container on {@code localhost:5432} (database {@code nexus}). Flyway
 * runs V1 and V2 migrations against this database during context
 * initialization, matching the production schema management strategy.
 * Existing migrations (already recorded in flyway_schema_history) are
 * skipped. Hibernate's {@code ddl-auto: validate} (from application.yml)
 * confirms entity annotations align with the Flyway-managed schema.
 */
@SpringBootTest(
    classes = PebApplication.class,
    webEnvironment = SpringBootTest.WebEnvironment.MOCK
)
@AutoConfigureMockMvc
@TestPropertySource(properties = {
    "spring.jackson.visibility.field=any",
    "spring.jackson.visibility.getter=any",
    "spring.jackson.visibility.setter=any",
    "spring.jackson.visibility.creator=any",
    // Isolated test database in the running pgvector container.
    // Created by: CREATE DATABASE peb_test; CREATE USER peb_test_user ...
    "spring.datasource.url=jdbc:postgresql://localhost:5432/peb_test",
    "spring.datasource.username=peb_test_user",
    "spring.datasource.password=peb_test_pass",
    // Flyway runs V1+V2 migrations; already-applied migrations are skipped.
    "spring.jpa.hibernate.ddl-auto=validate",
})
class AdmissionControllerFacadeTest {

    @Autowired
    private MockMvc mockMvc;

    @MockitoBean
    private PebGovernanceEngine governanceEngine;

    @Test
    void malformedViolation_returns422() throws Exception {
        when(governanceEngine.processForPath(any(), any()))
            .thenThrow(new MalformedAdmissionRequestException(
                "peb_report_violation requires a textual 'violation_type' field"));

        mockMvc.perform(post("/api/v1/peb/transaction")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{}"))
            .andExpect(status().isUnprocessableEntity())
            .andExpect(content().string(
                "Malformed admission request: "
                + "peb_report_violation requires a textual 'violation_type' field"));
    }

    @Test
    void validTransaction_returns200() throws Exception {
        when(governanceEngine.processForPath(any(), any()))
            .thenReturn("Mutation processed");

        mockMvc.perform(post("/api/v1/peb/transaction")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{}"))
            .andExpect(status().isOk())
            .andExpect(content().string("Mutation processed"));
    }
}
