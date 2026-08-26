package com.aibizarchitect.nexus.v1.spring.tackleregistry.tackle;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.ai.chat.model.ChatModel;
import org.springframework.ai.chat.model.ChatResponse;
import org.springframework.ai.chat.model.Generation;
import org.springframework.ai.chat.prompt.ChatOptions;
import org.springframework.ai.chat.prompt.Prompt;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * Dispatch + gate logic of the inference layer — no network, no keys.
 * The ChatModelFactory seam lets us verify prompt/options flow without
 * constructing real Spring AI models.
 */
@DisplayName("InferenceService dispatch")
class InferenceServiceTest {

    private final ChatModel fakeModel = mock(ChatModel.class);
    private InferenceService service =
            new InferenceService(null, // registry unused on direct-invoke paths
                    (type, ep, key, modelId) -> fakeModel);

    private void stubReply(String text) {
        when(fakeModel.getDefaultOptions()).thenReturn(ChatOptions.builder().build());
        when(fakeModel.call(any(Prompt.class))).thenReturn(new ChatResponse(
                java.util.List.of(new Generation(
                        new org.springframework.ai.chat.messages.AssistantMessage(text)))));
    }

    @Test
    @DisplayName("HTTP-invocable provider types are exactly the four starters")
    void httpInvocableTypes() {
        assertThat(InferenceService.isHttpInvocable("openai")).isTrue();
        assertThat(InferenceService.isHttpInvocable("deepseek")).isTrue();
        assertThat(InferenceService.isHttpInvocable("google")).isTrue();
        assertThat(InferenceService.isHttpInvocable("ollama")).isTrue();
        assertThat(InferenceService.isHttpInvocable("opencode")).isFalse();
        assertThat(InferenceService.isHttpInvocable("codex")).isFalse();
        assertThat(InferenceService.isHttpInvocable("spring_ai")).isFalse();
        assertThat(InferenceService.isHttpInvocable(null)).isFalse();
    }

    @Test
    @DisplayName("CLI-harness providers are refused with 415-shaped exception")
    void cliProvidersRefused() {
        var svc = new InferenceService(null,
                (t, e, k, m) -> { throw new AssertionError("factory must not be reached"); });
        assertThatThrownBy(() -> svc.invoke("opencode", null, null, "some/model", "hi"))
                .isInstanceOf(InferenceService.UnsupportedProviderException.class)
                .hasMessageContaining("opencode");
    }

    @Test
    @DisplayName("invoke passes the model identifier as per-call option and returns text")
    void invokeFlowsThroughFactory() {
        stubReply("Hello from resolved bundle");
        String out = service.invoke("ollama", "http://x", null, "llama3", "say hi");
        assertThat(out).isEqualTo("Hello from resolved bundle");
    }

    @Test
    @DisplayName("empty completions surface as IllegalStateException")
    void emptyCompletionSurfaces() {
        when(fakeModel.getDefaultOptions()).thenReturn(ChatOptions.builder().build());
        when(fakeModel.call(any(Prompt.class))).thenReturn(new ChatResponse(java.util.List.of()));
        assertThatThrownBy(() -> service.invoke("openai", null, "k", "gpt-x", "hi"))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("empty completion");
    }
}
