package com.aibizarchitect.nexus.v1.spring.atlas;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.TestPropertySource;

/**
 * Smoke test that verifies the Spring application context loads.
 *
 * <p>Overrides the production PostgreSQL datasource with H2 in-memory
 * so the test runs in CI without a live database.
 */
@SpringBootTest
@TestPropertySource(properties = {
        // Entities are mapped to the `registry` schema (shared with
        // service-registry). H2 in-memory only has the default PUBLIC schema
        // and Hibernate's namespace creation is disabled by default, so the
        // create-drop DDL would fail with "Schema \"REGISTRY\" not found".
        // The INIT clause creates the registry schema on first connection so
        // both the drop and create phases of create-drop run cleanly.
        "spring.datasource.url=jdbc:h2:mem:testdb;DB_CLOSE_DELAY=-1;INIT=CREATE SCHEMA IF NOT EXISTS registry",
        "spring.datasource.driver-class-name=org.h2.Driver",
        "spring.datasource.username=sa",
        "spring.datasource.password=",
        "spring.jpa.database-platform=org.hibernate.dialect.H2Dialect",
        "spring.jpa.hibernate.ddl-auto=create-drop"
})
class AtlasApplicationTests {

    @Test
    void contextLoads() {
    }
}
