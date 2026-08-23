package com.aibizarchitect.nexus.v1.spring.tackleregistry.tackle;

import org.springframework.ai.chat.model.ChatModel;
import org.springframework.ai.chat.model.ChatResponse;
import org.springframework.ai.chat.prompt.ChatOptions;
import org.springframework.ai.chat.prompt.Prompt;
import org.springframework.stereotype.Service;

/**
 * Resolves a tackle config bundle into a live Spring AI ChatModel and runs
 * prompts through it — the inference capability tackle-srv delegates to CLI
 * harnesses but cannot serve itself over HTTP.
 *
 * <p>Provider-type dispatch mirrors the four Spring AI starters on the
 * classpath. Construction is behind {@link ChatModelFactory} so dispatch
 * logic is unit-testable without network or keys.
 */
@Service
public class InferenceService {

    /** Thrown when the provider type cannot serve HTTP inference here. */
    public static final class UnsupportedProviderException extends RuntimeException {
        public UnsupportedProviderException(String message) { super(message); }
    }

    @FunctionalInterface
    public interface ChatModelFactory {
        ChatModel create(String providerType, String endpointUrl, String apiKey, String modelIdentifier);
    }

    private final TackleRegistryService registry;
    private final ChatModelFactory factory;

    /** Primary constructor — explicit so Spring does not see two candidates. */
    @org.springframework.beans.factory.annotation.Autowired
    public InferenceService(TackleRegistryService registry) {
        this(registry, InferenceService::defaultFactory);
    }

    InferenceService(TackleRegistryService registry, ChatModelFactory factory) {
        this.registry = registry;
        this.factory = factory;
    }

    /**
     * Invoke the winning active bundle for a role. Mirrors tackle-srv's
     * verified-model gate on its POST /test route.
     */
    public String invokeForRole(String role, String prompt) {
        TackleRecords.ResolvedRoleConfig config = registry.resolve(role);
        if (config == null) {
            throw new IllegalArgumentException("No config found for role '" + role + "'");
        }
        return invoke(config.providerType(), config.endpointUrl(), config.apiKey(),
                config.modelIdentifier(), prompt);
    }

    public String invoke(String providerType, String endpointUrl, String apiKey,
                         String modelIdentifier, String prompt) {
        if (!isHttpInvocable(providerType)) {
            throw new UnsupportedProviderException(
                    "Provider type '" + providerType + "' is harness/CLI-invoked; "
                            + "HTTP inference supports openai|deepseek|google|ollama only");
        }
        ChatModel model = factory.create(providerType, endpointUrl, apiKey, modelIdentifier);
        Prompt request = new Prompt(prompt,
                ChatOptions.builder().model(modelIdentifier).build());
        ChatResponse response = model.call(request);
        var generation = response.getResult();
        if (generation == null || generation.getOutput() == null
                || generation.getOutput().getText() == null) {
            throw new IllegalStateException("Model returned an empty completion");
        }
        return generation.getOutput().getText();
    }

    public static boolean isHttpInvocable(String providerType) {
        return switch (providerType == null ? "" : providerType) {
            case "openai", "deepseek", "google", "ollama" -> true;
            default -> false;
        };
    }

    // ── Production factory: build the matching Spring AI model ─────

    private static ChatModel defaultFactory(String providerType, String endpointUrl,
                                            String apiKey, String modelIdentifier) {
        return switch (providerType) {
            case "openai" -> openAi(endpointUrl, apiKey, modelIdentifier);
            case "deepseek" -> deepSeek(apiKey, modelIdentifier);
            case "ollama" -> ollama(endpointUrl, modelIdentifier);
            case "google" -> google(apiKey, modelIdentifier);
            default -> throw new UnsupportedProviderException(
                    "Unsupported provider type: " + providerType);
        };
    }

    // Shapes verified against the 2.0.0-M8 jars via javap:
    //  - OpenAI wraps the OFFICIAL openai-java SDK client (OpenAIOkHttpClient)
    //  - Ollama options live in org.springframework.ai.ollama.api
    //  - DeepSeek/Ollama/Google all use builder().defaultOptions(...)

    private static ChatModel openAi(String endpointUrl, String apiKey, String modelId) {
        // openai-java 4.36: the legacy .apiKey(String) field is IGNORED by
        // ClientOptions.build() — the credential must be explicit.
        String key = orDummy(apiKey);
        System.err.println("[tackleregistry-diag] openAi() entry: ep=" + endpointUrl
                + " keySet=" + (key != null && !key.isBlank()) + " model=" + modelId);
        var clientBuilder = com.openai.client.okhttp.OpenAIOkHttpClient.builder();
        System.err.println("[tackleregistry-diag] builder class = " + clientBuilder.getClass().getName());
        clientBuilder.credential(com.openai.credential.BearerTokenCredential.create(key));
        if (endpointUrl != null && !endpointUrl.isBlank()) {
            clientBuilder.baseUrl(endpointUrl);
        }
        Object client;
        try {
            client = clientBuilder.build();
        } catch (Throwable t) {
            System.err.println("[tackleregistry-diag] client build FAILED: " + t);
            t.printStackTrace();
            throw t;
        }
        System.err.println("[tackleregistry-diag] client built OK: " + client.getClass().getName());
        // M8 gotcha: OpenAiChatModel.build() ALSO lazily derives an async
        // streaming client from options.apiKey — without it, construction
        // dies in OpenAiSetup.setupAsyncClient with "At least one credential
        // source must be specified". The key must ride the options too.
        return org.springframework.ai.openai.OpenAiChatModel.builder()
                .openAiClient((com.openai.client.OpenAIClient) client)
                .options(org.springframework.ai.openai.OpenAiChatOptions.builder()
                        .model(modelId)
                        .apiKey(key)
                        .build())
                .build();
    }

    private static ChatModel deepSeek(String apiKey, String modelId) {
        var api = org.springframework.ai.deepseek.api.DeepSeekApi.builder()
                .apiKey(orDummy(apiKey))
                .build();
        return org.springframework.ai.deepseek.DeepSeekChatModel.builder()
                .deepSeekApi(api)
                .defaultOptions(org.springframework.ai.deepseek.DeepSeekChatOptions.builder()
                        .model(modelId).build())
                .build();
    }

    private static ChatModel ollama(String endpointUrl, String modelId) {
        var api = org.springframework.ai.ollama.api.OllamaApi.builder()
                .baseUrl(endpointUrl != null && !endpointUrl.isBlank()
                        ? endpointUrl : "http://localhost:11434")
                .build();
        return org.springframework.ai.ollama.OllamaChatModel.builder()
                .ollamaApi(api)
                .defaultOptions(org.springframework.ai.ollama.api.OllamaChatOptions.builder()
                        .model(modelId).build())
                .build();
    }

    private static ChatModel google(String apiKey, String modelId) {
        var client = com.google.genai.Client.builder().apiKey(orDummy(apiKey)).build();
        return org.springframework.ai.google.genai.GoogleGenAiChatModel.builder()
                .genAiClient(client)
                .defaultOptions(org.springframework.ai.google.genai.GoogleGenAiChatOptions.builder()
                        .model(modelId).build())
                .build();
    }

    private static String orDummy(String key) {
        return (key == null || key.isBlank()) ? "dummy-key-not-configured" : key;
    }
}
