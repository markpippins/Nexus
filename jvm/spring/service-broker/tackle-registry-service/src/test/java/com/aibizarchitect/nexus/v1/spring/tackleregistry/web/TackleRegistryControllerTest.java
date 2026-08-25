package com.aibizarchitect.nexus.v1.spring.tackleregistry.web;

import com.aibizarchitect.nexus.v1.spring.tackleregistry.tackle.TackleRecords;
import com.aibizarchitect.nexus.v1.spring.tackleregistry.tackle.TackleRegistryService;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.http.ResponseEntity;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * Unit tests for the /config registry mirror — verifies the controller
 * faithfully proxies TackleRegistryService and preserves tackle-srv's
 * 404-on-unresolvable-role contract for GET /config/resolve/{role}.
 */
@DisplayName("TackleRegistryController")
class TackleRegistryControllerTest {

    private final TackleRegistryService registry = mock(TackleRegistryService.class);
    private final TackleRegistryController controller = new TackleRegistryController(registry);

    @Test
    @DisplayName("collections endpoints return whatever the registry reports")
    void collectionsProxyThrough() {
        when(registry.providers()).thenReturn(List.of(new TackleRecords.Provider(
                "p1", "OpenRouter", "openai", "https://openrouter.ai/api/v1", null, null)));
        when(registry.models()).thenReturn(List.of());
        when(registry.roles()).thenReturn(List.of());
        when(registry.harnesses()).thenReturn(List.of());

        assertThat(controller.providers()).hasSize(1);
        assertThat(controller.models()).isEmpty();
        assertThat(controller.roles()).isEmpty();
        assertThat(controller.harnesses()).isEmpty();
    }

    @Test
    @DisplayName("resolve returns 200 with the winning bundle config")
    void resolveHit() {
        var cfg = new TackleRecords.ResolvedRoleConfig(
                "engineer", "x-preview-f-free", "prov-opencode", "OpenCode",
                "opencode", "", "http://localhost:3100", "Opencode CLI", List.of());
        when(registry.resolve("engineer")).thenReturn(cfg);

        ResponseEntity<?> resp = controller.resolve("engineer");
        assertThat(resp.getStatusCode().value()).isEqualTo(200);
        assertThat(((TackleRecords.ResolvedRoleConfig) resp.getBody())
                .modelIdentifier()).isEqualTo("x-preview-f-free");
    }

    @Test
    @DisplayName("resolve mirrors tackle-srv's 404 contract for unknown roles")
    void resolveMissIs404() {
        when(registry.resolve("ghost")).thenReturn(null);
        ResponseEntity<?> resp = controller.resolve("ghost");
        assertThat(resp.getStatusCode().value()).isEqualTo(404);
        assertThat(resp.getBody()).asString().contains("No config found");
    }

    @Test
    @DisplayName("bundles/{role} filters by role")
    void bundlesForRoleFilters() {
        when(registry.bundlesForRole("engineer")).thenReturn(List.of(
                new TackleRecords.ConfigBundle("b1", "primary", "engineer",
                        "m1", null, null, 0, "CLI", null, null, null, true)));
        assertThat(controller.bundlesForRole("engineer")).hasSize(1);
    }
}
