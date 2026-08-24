package com.aibizarchitect.nexus.v1.spring.tackleregistry;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.jackson.autoconfigure.JsonMapperBuilderCustomizer;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import tools.jackson.databind.PropertyNamingStrategies;

/**
 * D-C step 2 (consumer compatibility, analysis thread 6d97277a): opt-in
 * snake_case JSON serialization mode.
 *
 * tackle-srv returns raw PG rows in snake_case (endpoint_url, model_identifier,
 * is_active, ...). tackle-ui and tackle-mcp consume that shape. This JVM mirror
 * defaults to camelCase (Jackson record components), so consumers pointed at it
 * would break — unless this toggle is enabled.
 *
 * Enable with:
 *   tackle-registry.snake-case-serialization=true
 * (default false — camelCase stays the JVM-native default; the mode is opt-in.)
 *
 * When enabled, the single shared Jackson mapper applies the SNAKE_CASE naming
 * strategy, so every registry read (under /config/* AND /config/ai/*) serializes
 * snake_case for consumer parity.
 */
@Configuration
public class SnakeCaseSerializationConfig {

    @Bean
    @ConditionalOnProperty(
            prefix = "tackle-registry",
            name = "snake-case-serialization",
            havingValue = "true")
    public JsonMapperBuilderCustomizer snakeCaseMapperCustomizer() {
        return builder -> builder.propertyNamingStrategy(PropertyNamingStrategies.SNAKE_CASE);
    }
}
