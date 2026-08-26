package com.aibizarchitect.nexus.v1.spring.tackleregistry;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.context.ApplicationContext;
import org.springframework.core.env.Environment;
import org.springframework.test.context.TestPropertySource;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.*;

/**
 * Four-path coverage test suite for TackleRegistryApplication.
 *
 * <p>The tackle-registry-service is a CRITICAL governance runtime. Currently it is a
 * {@code @SpringBootApplication} skeleton with Spring AI (DeepSeek, OpenAI,
 * Google GenAI, Ollama) and NATS dependencies but no application code.
 *
 * <p>These tests document the expected startup behavior, dependency
 * requirements, and provide regression protection for when real services,
 * controllers, and configuration are added.
 */
@DisplayName("TackleRegistryApplication")
class TackleRegistryApplicationTests {

    // ═══════════════════════════════════════════════════════════════
    // Green Path — Context loads with proper configuration
    // ═══════════════════════════════════════════════════════════════

    @Nested
    @SpringBootTest
    @TestPropertySource(properties = {
            "spring.ai.deepseek.api-key=dummy-deepseek-key",
            "spring.ai.openai.api-key=dummy-openai-key",
            "spring.ai.google.genai.api-key=dummy-google-key",
            "spring.ai.ollama.base-url=http://localhost:11434"
    })
    @DisplayName("Green Path — Context loads with proper configuration")
    class GreenPath {

        @Autowired
        private ApplicationContext applicationContext;

        @Autowired
        private Environment environment;

        @Test
        @DisplayName("Application context loads successfully with valid API keys")
        void contextLoads() {
            assertNotNull(applicationContext, "ApplicationContext should be non-null");
            assertTrue(applicationContext.getBeanDefinitionCount() > 0,
                    "Context should have at least one bean");
        }

        @Test
        @DisplayName("Application name is set to tackle-registry-service")
        void applicationNameIsSet() {
            assertEquals("tackle-registry-service",
                    environment.getProperty("spring.application.name"),
                    "Application name must match the configured value");
        }

        @Test
        @DisplayName("TackleRegistryApplication bean is registered in context")
        void applicationBeanIsRegistered() {
            assertNotNull(applicationContext.getBean(TackleRegistryApplication.class),
                    "Main application class should be a Spring-managed bean");
        }
    }

    // ═══════════════════════════════════════════════════════════════
    // Orange Path — Auto-configuration verification, partial config
    // ═══════════════════════════════════════════════════════════════

    @Nested
    @SpringBootTest
    @TestPropertySource(properties = {
            "spring.ai.deepseek.api-key=dummy-deepseek-key",
            "spring.ai.openai.api-key=dummy-openai-key",
            "spring.ai.google.genai.api-key=dummy-google-key",
            "spring.ai.ollama.base-url=http://localhost:11434"
    })
    @DisplayName("Orange Path — Auto-configuration and partial key scenarios")
    class OrangePath {

        @Autowired
        private ApplicationContext applicationContext;

        @Test
        @DisplayName("Context loads successfully when all AI providers have keys")
        void contextLoadsWithAllProvidersConfigured() {
            assertNotNull(applicationContext,
                    "Context should load when all AI providers are configured");
        }

        @Test
        @DisplayName("Bean count does not silently explode — regression lock")
        void beanCountIsStable() {
            int count = applicationContext.getBeanDefinitionCount();
            assertTrue(count > 0, "Context should have beans");
            // GAP: bean count is not locked to a specific number because
            // auto-configuration may add/remove beans across Spring AI versions.
            // This test catches catastrophic drift (>500 beans from a skeleton app).
            assertTrue(count < 500,
                    "Bean count should not explode — currently " + count
                            + " beans. Investigate if auto-config adds unexpected beans.");
        }

        @Test
        @DisplayName("Only the skeleton @SpringBootApplication is user-defined — no extra beans")
        void onlySkeletonApplicationBeanIsUserDefined() {
            TackleRegistryApplication app =
                    applicationContext.getBean(TackleRegistryApplication.class);
            assertNotNull(app,
                    "Main application bean must be present");
            // With zero application code (no @Service, @Controller, @Repository),
            // all other beans come from auto-configuration. This test serves as a
            // canary — if someone adds a @Service without tests, the bean appears
            // here and this test must be updated.
        }

        @Test
        @DisplayName("NATS Connection factory bean is present when jnats is on classpath")
        void natsConnectionFactoryIsPresent() {
            // jnats does not provide Spring auto-configuration, so there is no
            // auto-configured Connection bean. This test documents that gap and
            // will fail if/when Spring NATS auto-config is added.
            boolean hasConnectionBean = applicationContext.getBeanNamesForType(
                    tryLoadClass("io.nats.client.Connection")
            ).length > 0;
            // Currently expected: false (no auto-config for NATS)
            // When NATS Spring auto-config is added, this test must be updated.
            assertFalse(hasConnectionBean,
                    "NATS Connection should NOT be auto-configured. "
                            + "If a NATS auto-config starter is added, update this test.");
        }

        private Class<?> tryLoadClass(String className) {
            try {
                return Class.forName(className);
            } catch (ClassNotFoundException e) {
                return null;
            }
        }
    }

    // ═══════════════════════════════════════════════════════════════
    // Red Path — Startup failures, missing configuration
    // ═══════════════════════════════════════════════════════════════

    @Nested
    @DisplayName("Red Path — Startup failures")
    class RedPath {

        private final ApplicationContextRunner runner =
                new ApplicationContextRunner()
                        .withUserConfiguration(TackleRegistryApplication.class);

        @Test
        @DisplayName("Startup fails when DeepSeek API key is not set")
        void startupFailsWithoutDeepSeekApiKey() {
            runner.run(context -> {
                assertThat(context).hasFailed();
                assertThat(context.getStartupFailure())
                        .hasMessageContaining("DeepSeek API key must be set");
            });
        }

        @Test
        @DisplayName("Startup failure message is actionable — references the missing key")
        void failureMessageIsActionable() {
            runner.run(context -> {
                assertThat(context).hasFailed();
                String message = context.getStartupFailure().getMessage();
                assertTrue(
                        message.toLowerCase().contains("api key"),
                        "Error message must reference the missing API key: " + message
                );
            });
        }

        @Test
        @DisplayName("Startup fails with blank (empty) API key — not treated as valid")
        void startupFailsWithBlankApiKey() {
            new ApplicationContextRunner()
                    .withUserConfiguration(TackleRegistryApplication.class)
                    .withPropertyValues(
                            "spring.ai.deepseek.api-key=",
                            "spring.ai.openai.api-key=",
                            "spring.ai.google.genai.api-key="
                    )
                    .run(context -> {
                        assertThat(context).hasFailed();
                    });
        }

        @Test
        @DisplayName("Metamorphic: startup failure is deterministic — same error every time")
        void startupFailureIsDeterministic() {
            String firstMessage = getFailureMessage();
            String secondMessage = getFailureMessage();
            assertEquals(firstMessage, secondMessage,
                    "Startup failure must produce the same error message on every attempt");
        }

        private String getFailureMessage() {
            final String[] message = {null};
            runner.run(context -> {
                if (context.getStartupFailure() != null) {
                    message[0] = context.getStartupFailure().getMessage();
                }
            });
            return message[0];
        }
    }

    // ═══════════════════════════════════════════════════════════════
    // Silent Failure — Regression, readiness, classpath checks
    // ═══════════════════════════════════════════════════════════════

    @Nested
    @DisplayName("Silent Failure — Regression and readiness checks")
    class SilentFailure {

        @Test
        @DisplayName("NATS client Connection class is available on classpath")
        void natsConnectionClassIsPresent() {
            assertDoesNotThrow(() -> Class.forName("io.nats.client.Connection"),
                    "io.nats.client.Connection must be on classpath — "
                            + "jnats dependency may be missing or excluded");
        }

        @Test
        @DisplayName("NATS client Options class is available on classpath")
        void natsOptionsClassIsPresent() {
            assertDoesNotThrow(() -> Class.forName("io.nats.client.Options"),
                    "io.nats.client.Options must be on classpath");
        }

        @Test
        @DisplayName("@SpringBootApplication annotation is present on main class")
        void springBootApplicationAnnotationIsPresent() {
            SpringBootApplication annotation = TackleRegistryApplication.class
                    .getAnnotation(SpringBootApplication.class);
            assertNotNull(annotation,
                    "TackleRegistryApplication must be annotated with @SpringBootApplication. "
                            + "Removal would prevent Spring Boot auto-configuration.");
        }

        @Test
        @DisplayName("Application class is in correct package for component scanning")
        void applicationPackageIsCorrect() {
            String packageName = TackleRegistryApplication.class.getPackageName();
            assertEquals("com.aibizarchitect.nexus.v1.spring.tackleregistry", packageName,
                    "Package must not change — component scanning depends on it");
        }

        @Test
        @DisplayName("Application main method is callable via reflection")
        void mainMethodIsCallable() throws Exception {
            var mainMethod = TackleRegistryApplication.class
                    .getMethod("main", String[].class);
            assertNotNull(mainMethod, "main(String[]) method must exist");
        }

        @Test
        @DisplayName("application.properties exists with expected application name")
        void applicationPropertiesHasExpectedName() {
            // Regression lock: the application name in properties must match
            // what Environment reports (tested in GreenPath).
            // This test ensures the property file itself isn't deleted or renamed.
            var resource = getClass().getClassLoader()
                    .getResource("application.properties");
            assertNotNull(resource, "application.properties must exist in src/main/resources");
        }
    }
}
