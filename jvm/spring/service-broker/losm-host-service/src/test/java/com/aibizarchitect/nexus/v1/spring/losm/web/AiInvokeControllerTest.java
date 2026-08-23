package com.aibizarchitect.nexus.v1.spring.losm.web;

import com.aibizarchitect.nexus.v1.spring.losm.tackle.InferenceService;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * Unit tests for the /ai/invoke surface — controller dispatch, snake_case
 * payload binding (tackle-srv API parity), and error-code mapping.
 *
 * <p>Note on JSON binding: Boot 4 ships Jackson 3 (tools.jackson), whose
 * annotations live under tools.jackson.databind — com.fasterxml annotations
 * are silently IGNORED by the HTTP converters. The InvokeRequest record
 * carries @JsonNaming(SnakeCaseStrategy) from the tools.jackson package;
 * these tests pin that behavior so a future dependency bump cannot quietly
 * regress role/provider payloads to all-null fields.
 */
@DisplayName("AiInvokeController")
class AiInvokeControllerTest {

    private final InferenceService inference = mock(InferenceService.class);
    private final AiInvokeController controller = new AiInvokeController(inference);

    // ── Payload binding (Jackson 3 snake_case parity with tackle-srv) ──

    @Test
    @DisplayName("snake_case JSON binds every field of InvokeRequest")
    void snakeCaseBinding() {
        var mapper = tools.jackson.databind.json.JsonMapper.builder().build();
        var req = mapper.readValue(
                """
                {"provider_type":"openai","endpoint_url":"https://x/v1",
                 "api_key":"k","model_identifier":"m1","prompt":"hi"}
                """,
                AiInvokeController.InvokeRequest.class);
        assertThat(req.providerType()).isEqualTo("openai");
        assertThat(req.endpointUrl()).isEqualTo("https://x/v1");
        assertThat(req.apiKey()).isEqualTo("k");
        assertThat(req.modelIdentifier()).isEqualTo("m1");
        assertThat(req.prompt()).isEqualTo("hi");
    }

    @Test
    @DisplayName("role-only payload binds and routes to invokeForRole")
    void roleBindingRoutesToRolePath() {
        var mapper = tools.jackson.databind.json.JsonMapper.builder().build();
        var req = mapper.readValue(
                "{\"role\":\"engineer\",\"prompt\":\"say hi\"}",
                AiInvokeController.InvokeRequest.class);
        assertThat(req.role()).isEqualTo("engineer");

        when(inference.invokeForRole("engineer", "say hi")).thenReturn("hello");
        var resp = controller.invoke(req);
        assertThat(resp.getStatusCode().value()).isEqualTo(200);
        assertThat(((Map<?, ?>) resp.getBody()).get("reply")).isEqualTo("hello");
    }

    // ── Dispatch & error mapping ───────────────────────────────────────

    @Test
    @DisplayName("missing prompt -> 400")
    void missingPromptIs400() {
        var resp = controller.invoke(new AiInvokeController.InvokeRequest(
                null, "openai", null, null, null, "  "));
        assertThat(resp.getStatusCode().value()).isEqualTo(400);
    }

    @Test
    @DisplayName("unknown role -> 404")
    void unknownRoleIs404() {
        when(inference.invokeForRole(anyString(), anyString()))
                .thenThrow(new IllegalArgumentException("No config found for role 'ghost'"));
        var resp = controller.invoke(new AiInvokeController.InvokeRequest(
                "ghost", null, null, null, null, "hi"));
        assertThat(resp.getStatusCode().value()).isEqualTo(404);
        assertThat(((Map<?, ?>) resp.getBody()).get("error")).asString()
                .contains("ghost");
    }

    @Test
    @DisplayName("CLI-harness provider -> 415 via UnsupportedProviderException")
    void cliProviderIs415() {
        when(inference.invokeForRole(anyString(), anyString()))
                .thenThrow(new InferenceService.UnsupportedProviderException(
                        "Provider type 'opencode' is harness/CLI-invoked"));
        var resp = controller.invoke(new AiInvokeController.InvokeRequest(
                "engineer", null, null, null, null, "hi"));
        assertThat(resp.getStatusCode().value()).isEqualTo(415);
    }

    @Test
    @DisplayName("direct provider path passes endpoint/key/model through")
    void directPathPassesThrough() {
        when(inference.invoke("ollama", "http://o:11434", null, "llama3", "hi"))
                .thenReturn("ok");
        var resp = controller.invoke(new AiInvokeController.InvokeRequest(
                null, "ollama", "http://o:11434", null, "llama3", "hi"));
        assertThat(resp.getStatusCode().value()).isEqualTo(200);
        assertThat(((Map<?, ?>) resp.getBody()).get("reply")).isEqualTo("ok");
    }
}
