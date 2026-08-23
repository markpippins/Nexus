package com.aibizarchitect.nexus.v1.spring.losm.web;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.ai.chat.messages.AssistantMessage;
import org.springframework.ai.chat.model.ChatModel;
import org.springframework.ai.chat.model.ChatResponse;
import org.springframework.ai.chat.model.Generation;
import org.springframework.ai.chat.prompt.Prompt;
import org.springframework.beans.factory.ObjectProvider;

import java.util.Iterator;
import java.util.List;
import java.util.stream.Stream;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * Plain unit tests for the Spring AI hello-world controller.
 *
 * <p>Deliberately framework-free: Spring Boot 4 modularized the classic test
 * slices (@WebMvcTest et al.) out of spring-boot-test-autoconfigure into
 * per-technology artifacts, so slicing this tiny controller would drag in
 * extra test modules for no gain. A hand-rolled ObjectProvider stands in for
 * the container — no API keys, no context, fast.
 */
@DisplayName("AiHelloController")
class AiHelloControllerTest {

    /** Minimal ObjectProvider stub — enough for the controller's usage. */
    private static ObjectProvider<ChatModel> providerOf(ChatModel... models) {
        List<ChatModel> list = List.of(models);
        return new ObjectProvider<>() {
            @Override
            public ChatModel getObject(Object... args) {
                return list.get(0);
            }

            @Override
            public ChatModel getObject() {
                return list.get(0);
            }

            @Override
            public ChatModel getIfAvailable() {
                return list.isEmpty() ? null : list.get(0);
            }

            @Override
            public ChatModel getIfUnique() {
                return list.size() == 1 ? list.get(0) : null;
            }

            @Override
            public Iterator<ChatModel> iterator() {
                return list.iterator();
            }

            @Override
            public Stream<ChatModel> stream() {
                return list.stream();
            }
        };
    }

    @Test
    @DisplayName("ping reports service status and model availability")
    void pingReportsStatus() {
        AiHelloController controller =
                new AiHelloController(providerOf(mock(ChatModel.class)));
        var body = controller.ping();
        assertThat(body)
                .containsEntry("service", "losm-host-service")
                .containsEntry("status", "ok")
                .containsEntry("modelsAvailable", 1L);
    }

    @Test
    @DisplayName("hello routes a prompt through the available ChatModel")
    void helloCallsModel() {
        ChatModel model = mock(ChatModel.class);
        // DefaultChatClient mutates the model's default options per call.
        when(model.getDefaultOptions()).thenReturn(
                org.springframework.ai.chat.prompt.ChatOptions.builder().build());
        when(model.call(any(Prompt.class))).thenReturn(new ChatResponse(
                List.of(new Generation(new AssistantMessage("Hello governance")))));

        AiHelloController controller = new AiHelloController(providerOf(model));
        var body = controller.hello("governance");
        assertThat(body)
                .containsEntry("reply", "Hello governance")
                .doesNotContainKey("error");
    }

    @Test
    @DisplayName("hello degrades gracefully when no ChatModel is configured")
    void helloWithoutModelDegradesGracefully() {
        AiHelloController controller = new AiHelloController(providerOf());
        var body = controller.hello("world");
        assertThat(body)
                .containsEntry("model", "none")
                .containsKey("reply");
    }

    @Test
    @DisplayName("models lists discovered ChatModel beans")
    void modelsListsBeans() {
        AiHelloController controller =
                new AiHelloController(providerOf(mock(ChatModel.class)));
        var body = controller.models();
        assertThat(body).containsEntry("count", 1);
    }
}
