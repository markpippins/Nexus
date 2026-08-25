package com.aibizarchitect.nexus.v1.spring.tackleregistry.web;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.TestPropertySource;
import org.springframework.web.reactive.result.method.RequestMappingInfo;
import org.springframework.web.reactive.result.method.annotation.RequestMappingHandlerMapping;

import java.util.Set;
import java.util.stream.Collectors;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * D-C step 2 (consumer compatibility, analysis thread 6d97277a): every /config
 * read route is ALSO served under /config/ai/* — the tackle-srv mount path — so
 * existing consumers can repoint at this service without rewriting URL prefixes.
 * This test pins the alias table so a future refactor can't silently drop it.
 */
@DisplayName("TackleRegistry /config/ai/* alias routes (D-C step 2)")
@SpringBootTest
@TestPropertySource(properties = {
        "spring.ai.deepseek.api-key=dummy-deepseek-key",
        "spring.ai.openai.api-key=dummy-openai-key",
        "spring.ai.google.genai.api-key=dummy-google-key",
        "spring.ai.ollama.base-url=http://localhost:11434",
})
class TackleRegistryRouteMappingTest {

    @Autowired
    private RequestMappingHandlerMapping handlerMapping;

    private Set<String> patterns() {
        return handlerMapping.getHandlerMethods().keySet().stream()
                .map(RequestMappingInfo::getPatternsCondition)
                .flatMap(c -> c.getPatterns().stream())
                .map(p -> p.getPatternString())
                .collect(Collectors.toSet());
    }

    @Test
    @DisplayName("every /config read route has a /config/ai alias")
    void aliasesRegistered() {
        Set<String> patterns = patterns();
        for (String alias : java.util.List.of(
                "/config/ai/providers",
                "/config/ai/harnesses",
                "/config/ai/models",
                "/config/ai/roles",
                "/config/ai/bundles",
                "/config/ai/bundles/{role}",
                "/config/ai/resolve/{role}")) {
            assertThat(patterns).contains(alias);
        }
    }

    @Test
    @DisplayName("canonical /config routes remain registered alongside the aliases")
    void canonicalRoutesRemain() {
        Set<String> patterns = patterns();
        for (String canonical : java.util.List.of(
                "/config/providers",
                "/config/harnesses",
                "/config/models",
                "/config/roles",
                "/config/bundles",
                "/config/bundles/{role}",
                "/config/resolve/{role}")) {
            assertThat(patterns).contains(canonical);
        }
    }
}
