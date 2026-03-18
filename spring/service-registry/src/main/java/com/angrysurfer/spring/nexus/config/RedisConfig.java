package com.angrysurfer.spring.nexus.config;

import java.time.Duration;
import java.util.HashMap;
import java.util.Map;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.cache.CacheManager;
import org.springframework.cache.annotation.CachingConfigurer;
import org.springframework.cache.annotation.EnableCaching;
import org.springframework.cache.interceptor.CacheErrorHandler;
import org.springframework.cache.interceptor.SimpleCacheErrorHandler;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.data.redis.cache.RedisCacheConfiguration;
import org.springframework.data.redis.cache.RedisCacheManager;
import org.springframework.data.redis.connection.RedisConnectionFactory;
import org.springframework.data.redis.connection.RedisStandaloneConfiguration;
import org.springframework.data.redis.connection.lettuce.LettuceConnectionFactory;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.listener.RedisMessageListenerContainer;
import org.springframework.data.redis.serializer.GenericJackson2JsonRedisSerializer;
import org.springframework.data.redis.serializer.Jackson2JsonRedisSerializer;
import org.springframework.data.redis.serializer.RedisSerializationContext;
import org.springframework.data.redis.serializer.StringRedisSerializer;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;

/**
 * Redis configuration for caching, real-time service status, and heartbeat
 * data.
 * Provides caching abstraction, pub/sub capabilities, and custom TTL
 * management.
 * This configuration is only loaded when spring.cache.type=redis.
 */
@Configuration
@EnableCaching
@ConditionalOnProperty(name = "spring.cache.type", havingValue = "redis")
public class RedisConfig implements CachingConfigurer {

    // Cache names
    public static final String CACHE_FRAMEWORKS = "frameworks";
    public static final String CACHE_FRAMEWORKS_BY_CATEGORY = "frameworksByCategory";
    public static final String CACHE_FRAMEWORKS_BY_LANGUAGE = "frameworksByLanguage";
    public static final String CACHE_FRAMEWORK_CATEGORIES = "frameworkCategories";
    public static final String CACHE_FRAMEWORK_LANGUAGES = "frameworkLanguages";
    public static final String CACHE_SERVICE_TYPES = "serviceTypes";
    public static final String CACHE_SERVER_TYPES = "serverTypes";
    public static final String CACHE_ENVIRONMENT_TYPES = "environmentTypes";
    public static final String CACHE_LIBRARY_CATEGORIES = "libraryCategories";
    public static final String CACHE_SERVICES = "services";
    public static final String CACHE_DEPLOYMENTS = "deployments";

    @Value("${spring.data.redis.host:localhost}")
    private String redisHost;

    @Value("${spring.data.redis.port:6379}")
    private int redisPort;

    @Value("${spring.data.redis.password:}")
    private String redisPassword;

    @Value("${cache.ttl.static:3600000}")
    private long staticCacheTtlMs;

    @Value("${cache.ttl.dynamic:900000}")
    private long dynamicCacheTtlMs;

    @Bean
    public LettuceConnectionFactory redisConnectionFactory() {
        RedisStandaloneConfiguration config = new RedisStandaloneConfiguration();
        config.setHostName(redisHost);
        config.setPort(redisPort);
        if (redisPassword != null && !redisPassword.isEmpty()) {
            config.setPassword(redisPassword);
        }
        return new LettuceConnectionFactory(config);
    }

    @Bean
    public ObjectMapper redisObjectMapper() {
        ObjectMapper mapper = new ObjectMapper();
        mapper.registerModule(new JavaTimeModule());
        mapper.disable(SerializationFeature.WRITE_DATES_AS_TIMESTAMPS);
        // Enable default typing to preserve class information during serialization
        mapper.activateDefaultTyping(mapper.getPolymorphicTypeValidator(), ObjectMapper.DefaultTyping.NON_FINAL);
        return mapper;
    }

    @Bean
    public RedisTemplate<String, Object> redisTemplate(RedisConnectionFactory connectionFactory,
            ObjectMapper redisObjectMapper) {
        RedisTemplate<String, Object> template = new RedisTemplate<>();
        template.setConnectionFactory(connectionFactory);

        // Use String serializer for keys
        template.setKeySerializer(new StringRedisSerializer());
        template.setHashKeySerializer(new StringRedisSerializer());

        // Use Jackson serializer for values
        Jackson2JsonRedisSerializer<Object> jsonSerializer = new Jackson2JsonRedisSerializer<>(redisObjectMapper,
                Object.class);
        template.setValueSerializer(jsonSerializer);
        template.setHashValueSerializer(jsonSerializer);

        template.afterPropertiesSet();
        return template;
    }

    @Bean
    public StringRedisTemplate stringRedisTemplate(RedisConnectionFactory connectionFactory) {
        return new StringRedisTemplate(connectionFactory);
    }

    @Bean
    public RedisMessageListenerContainer redisMessageListenerContainer(RedisConnectionFactory connectionFactory) {
        RedisMessageListenerContainer container = new RedisMessageListenerContainer();
        container.setConnectionFactory(connectionFactory);
        return container;
    }

    @Bean
    @Override
    public CacheManager cacheManager() {
        // Get the custom ObjectMapper
        ObjectMapper mapper = redisObjectMapper();

        // Default cache configuration with static TTL
        RedisCacheConfiguration defaultConfig = RedisCacheConfiguration.defaultCacheConfig()
                .entryTtl(Duration.ofMillis(staticCacheTtlMs))
                .serializeKeysWith(
                        RedisSerializationContext.SerializationPair.fromSerializer(new StringRedisSerializer()))
                .serializeValuesWith(RedisSerializationContext.SerializationPair
                        .fromSerializer(new GenericJackson2JsonRedisSerializer(mapper)));

        // Dynamic cache configuration with shorter TTL
        RedisCacheConfiguration dynamicConfig = RedisCacheConfiguration.defaultCacheConfig()
                .entryTtl(Duration.ofMillis(dynamicCacheTtlMs))
                .serializeKeysWith(
                        RedisSerializationContext.SerializationPair.fromSerializer(new StringRedisSerializer()))
                .serializeValuesWith(RedisSerializationContext.SerializationPair
                        .fromSerializer(new GenericJackson2JsonRedisSerializer(mapper)));

        // Configure specific caches
        Map<String, RedisCacheConfiguration> cacheConfigurations = new HashMap<>();

        // Static lookup data - use default (1 hour TTL)
        cacheConfigurations.put(CACHE_FRAMEWORKS, defaultConfig);
        cacheConfigurations.put(CACHE_FRAMEWORKS_BY_CATEGORY, defaultConfig);
        cacheConfigurations.put(CACHE_FRAMEWORKS_BY_LANGUAGE, defaultConfig);
        cacheConfigurations.put(CACHE_FRAMEWORK_CATEGORIES, defaultConfig);
        cacheConfigurations.put(CACHE_FRAMEWORK_LANGUAGES, defaultConfig);
        cacheConfigurations.put(CACHE_SERVICE_TYPES, defaultConfig);
        cacheConfigurations.put(CACHE_SERVER_TYPES, defaultConfig);
        cacheConfigurations.put(CACHE_ENVIRONMENT_TYPES, defaultConfig);
        cacheConfigurations.put(CACHE_LIBRARY_CATEGORIES, defaultConfig);

        // Dynamic data - use shorter TTL (15 minutes)
        cacheConfigurations.put(CACHE_SERVICES, dynamicConfig);
        cacheConfigurations.put(CACHE_DEPLOYMENTS, dynamicConfig);

        return RedisCacheManager.builder(redisConnectionFactory())
                .cacheDefaults(defaultConfig)
                .withInitialCacheConfigurations(cacheConfigurations)
                .transactionAware()
                .build();
    }

    @Bean
    @Override
    public CacheErrorHandler errorHandler() {
        return new SimpleCacheErrorHandler() {
            @Override
            public void handleCacheGetError(RuntimeException exception, org.springframework.cache.Cache cache,
                    Object key) {
                // Log and continue without cache
                System.err.println("Cache GET error for cache '" + cache.getName() + "', key: " + key + " - "
                        + exception.getMessage());
            }

            @Override
            public void handleCachePutError(RuntimeException exception, org.springframework.cache.Cache cache,
                    Object key, Object value) {
                // Log and continue without cache
                System.err.println("Cache PUT error for cache '" + cache.getName() + "', key: " + key + " - "
                        + exception.getMessage());
            }

            @Override
            public void handleCacheEvictError(RuntimeException exception, org.springframework.cache.Cache cache,
                    Object key) {
                // Log and continue without cache
                System.err.println("Cache EVICT error for cache '" + cache.getName() + "', key: " + key + " - "
                        + exception.getMessage());
            }

            @Override
            public void handleCacheClearError(RuntimeException exception, org.springframework.cache.Cache cache) {
                // Log and continue without cache
                System.err.println("Cache CLEAR error for cache '" + cache.getName() + "' - " + exception.getMessage());
            }
        };
    }
}
