package com.aibizarchitect.nexus.v1.spring.losm.web;

import org.springframework.ai.chat.client.ChatClient;
import org.springframework.ai.chat.model.ChatModel;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Spring AI "hello world" for the LOSM host runtime.
 *
 * <p>Deliberately tolerant of a keyless environment: chat models are
 * discovered through {@link ObjectProvider} at request time, so the context
 * loads (and existing skeleton tests stay green) whether zero, one, or all
 * four providers are configured. /ai/hello degrades to an explanatory
 * payload when no model is reachable; /ai/models reports what Spring AI
 * auto-configuration found — useful when wiring governance tooling around it.
 */
@RestController
@RequestMapping("/ai")
public class AiHelloController {

    private final ObjectProvider<ChatModel> chatModels;

    public AiHelloController(ObjectProvider<ChatModel> chatModels) {
        this.chatModels = chatModels;
    }

    /** Static liveness surface — never touches a model, safe for probes. */
    @GetMapping("/ping")
    public Map<String, Object> ping() {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("service", "losm-host-service");
        body.put("status", "ok");
        body.put("modelsAvailable", chatModels.stream().count());
        return body;
    }

    /**
     * The hello world: one-shot prompt through the first available ChatModel.
     * Without any configured provider it answers with setup guidance instead
     * of failing — this service is an exploration sandbox, not a hard dep.
     */
    @GetMapping("/hello")
    public Map<String, String> hello(@RequestParam(defaultValue = "world") String name) {
        ChatModel model = chatModels.getIfAvailable();
        Map<String, String> body = new LinkedHashMap<>();
        if (model == null) {
            body.put("reply", "No chat model is configured. Set spring.ai.* properties "
                    + "(e.g. spring.ai.ollama.base-url) and restart.");
            body.put("model", "none");
            return body;
        }
        String reply = ChatClient.create(model)
                .prompt()
                .user("Say hello to " + name + " in one short sentence.")
                .call()
                .content();
        body.put("reply", reply);
        body.put("model", model.getClass().getSimpleName());
        return body;
    }

    /** Introspection aid: which ChatModel beans did auto-configuration register? */
    @GetMapping("/models")
    public Map<String, Object> models() {
        List<String> names = chatModels.stream().map(m -> m.getClass().getSimpleName()).toList();
        return Map.of("count", names.size(), "models", names);
    }
}
