package com.aibizarchitect.nexus.v1.spring.topology.entity;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

/**
 * Tests for {@link ServiceDependency} entity covering all four paths.
 *
 * <p>The polymorphic sourceType/targetType fields (McpServer, RunnableService,
 * Server) are plain strings — the DB enforces referential integrity but the
 * entity does not validate type values. These tests document that gap.
 */
@DisplayName("ServiceDependency")
class ServiceDependencyTest {

    @Nested
    @DisplayName("Green path — valid construction")
    class GreenPath {

        @Test
        @DisplayName("all-args constructor works")
        void allArgsConstructor_works() {
            ServiceDependency d = new ServiceDependency(1L, "McpServer", 10L,
                "RunnableService", 20L, "REQUIRED", "depends on nebula");

            assertEquals(1L, d.getId());
            assertEquals("McpServer", d.getSourceType());
            assertEquals(10L, d.getSourceId());
            assertEquals("RunnableService", d.getTargetType());
            assertEquals(20L, d.getTargetId());
            assertEquals("REQUIRED", d.getCriticality());
            assertEquals("depends on nebula", d.getDescription());
        }

        @Test
        @DisplayName("criticality OPTIONAL is accepted")
        void optionalCriticality_accepted() {
            ServiceDependency d = new ServiceDependency();
            d.setSourceType("McpServer");
            d.setSourceId(1L);
            d.setTargetType("RunnableService");
            d.setTargetId(2L);
            d.setCriticality("OPTIONAL");

            assertEquals("OPTIONAL", d.getCriticality());
        }
    }

    @Nested
    @DisplayName("Orange path — null and blank fields")
    class OrangePath {

        @Test
        @DisplayName("null criticality is accepted")
        void nullCriticality_accepted() {
            ServiceDependency d = new ServiceDependency();
            assertNull(d.getCriticality(), "Criticality can be null");
        }

        @Test
        @DisplayName("null description is accepted")
        void nullDescription_accepted() {
            ServiceDependency d = new ServiceDependency();
            assertNull(d.getDescription(), "Description can be null");
        }
    }

    @Nested
    @DisplayName("Red path — polymorphic type safety gap")
    class RedPath {

        /**
         * GAP: sourceType and targetType are plain strings with no enum
         * validation. Invalid values are accepted at the entity level.
         * Only the DB and consumer code enforce correctness.
         */
        @Test
        @DisplayName("GAP: arbitrary sourceType string is accepted")
        void arbitrarySourceType_accepted() {
            ServiceDependency d = new ServiceDependency();
            d.setSourceType("NotARealType");
            d.setSourceId(1L);
            d.setTargetType("AlsoFake");
            d.setTargetId(2L);

            assertEquals("NotARealType", d.getSourceType(),
                "GAP: Entity does not validate sourceType — any string is accepted");
            assertEquals("AlsoFake", d.getTargetType(),
                "GAP: Entity does not validate targetType");
        }

        @Test
        @DisplayName("self-referencing dependency is accepted (no cycle check)")
        void selfReferencing_accepted() {
            ServiceDependency d = new ServiceDependency();
            d.setSourceType("McpServer");
            d.setSourceId(1L);
            d.setTargetType("McpServer");
            d.setTargetId(1L); // points to itself

            assertEquals(d.getSourceType(), d.getTargetType(),
                "GAP: Self-referencing dependencies are not prevented at entity level");
            assertEquals(d.getSourceId(), d.getTargetId(),
                "GAP: Circular dependencies are not caught");
        }

        @Test
        @DisplayName("negative sourceId/targetId accepted (no constraint)")
        void negativeIds_accepted() {
            ServiceDependency d = new ServiceDependency();
            d.setSourceType("Server");
            d.setSourceId(-1L);
            d.setTargetType("Server");
            d.setTargetId(-999L);

            assertEquals(-1L, d.getSourceId(),
                "GAP: Negative IDs are accepted at entity level");
        }
    }

    @Nested
    @DisplayName("Silent failure — setter/getter consistency")
    class SilentFailure {

        @Test
        @DisplayName("setter/getter round-trip preserves all values")
        void roundTrip_preservesValues() {
            ServiceDependency d = new ServiceDependency();
            d.setId(42L);
            d.setSourceType("RunnableService");
            d.setSourceId(100L);
            d.setTargetType("McpServer");
            d.setTargetId(200L);
            d.setCriticality("REQUIRED");
            d.setDescription("critical path dependency");

            assertEquals(42L, d.getId());
            assertEquals("RunnableService", d.getSourceType());
            assertEquals(100L, d.getSourceId());
            assertEquals("McpServer", d.getTargetType());
            assertEquals(200L, d.getTargetId());
            assertEquals("REQUIRED", d.getCriticality());
            assertEquals("critical path dependency", d.getDescription());
        }
    }
}
