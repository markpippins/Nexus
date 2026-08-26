package com.aibizarchitect.nexus.v1.spring.tackleregistry.web;

import com.aibizarchitect.nexus.v1.spring.tackleregistry.tackle.TackleRecords;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.TestPropertySource;
import tools.jackson.databind.ObjectMapper;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * D-C step 2 (consumer compatibility, analysis thread 6d97277a): the opt-in
 * snake_case serialization mode. Default is camelCase (JVM-native); enabling
 * tackle-registry.snake-case-serialization=true switches the shared mapper to
 * SNAKE_CASE so tackle-ui / tackle-mcp consumers get tackle-srv-shaped rows.
 */
@DisplayName("SnakeCase serialization toggle (D-C step 2)")
class SnakeCaseSerializationTest {

    @Nested
    @SpringBootTest
    @TestPropertySource(properties = {
            "spring.ai.deepseek.api-key=dummy-deepseek-key",
            "spring.ai.openai.api-key=dummy-openai-key",
            "spring.ai.google.genai.api-key=dummy-google-key",
            "spring.ai.ollama.base-url=http://localhost:11434",
            "tackle-registry.snake-case-serialization=true",
    })
    @DisplayName("Mode ON — snake_case for consumer parity")
    class ModeOn {

        @Autowired
        private ObjectMapper mapper;

        @Test
        @DisplayName("Provider serializes snake_case (endpoint_url), not camelCase")
        void providerSerializesSnakeCase() throws Exception {
            var p = new TackleRecords.Provider(
                    "p1", "OpenRouter", "openai", "https://openrouter.ai/api/v1", null, null);
            String json = mapper.writeValueAsString(p);
            assertThat(json)
                    .contains("\"endpoint_url\"")
                    .doesNotContain("\"endpointUrl\"");
        }

        @Test
        @DisplayName("ResolvedRoleConfig serializes snake_case fields")
        void resolvedConfigSerializesSnakeCase() throws Exception {
            var cfg = new TackleRecords.ResolvedRoleConfig(
                    "engineer", "x-preview-f-free", "prov-opencode", "OpenCode",
                    "opencode", "", "http://localhost:3100", "Opencode CLI", java.util.List.of());
            String json = mapper.writeValueAsString(cfg);
            assertThat(json)
                    .contains("\"model_identifier\"")
                    .contains("\"provider_name\"")
                    .contains("\"endpoint_url\"")
                    .doesNotContain("\"modelIdentifier\"");
        }
    }

    @Nested
    @SpringBootTest
    @TestPropertySource(properties = {
            "spring.ai.deepseek.api-key=dummy-deepseek-key",
            "spring.ai.openai.api-key=dummy-openai-key",
            "spring.ai.google.genai.api-key=dummy-google-key",
            "spring.ai.ollama.base-url=http://localhost:11434",
            // NOTE: snake-case-serialization intentionally NOT set → default off.
    })
    @DisplayName("Mode OFF (default) — camelCase preserved")
    class ModeOff {

        @Autowired
        private ObjectMapper mapper;

        @Test
        @DisplayName("Provider serializes camelCase by default")
        void providerSerializesCamelCase() throws Exception {
            var p = new TackleRecords.Provider(
                    "p1", "OpenRouter", "openai", "https://openrouter.ai/api/v1", null, null);
            String json = mapper.writeValueAsString(p);
            assertThat(json)
                    .contains("\"endpointUrl\"")
                    .doesNotContain("\"endpoint_url\"");
        }
    }
}
