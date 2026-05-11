package com.aibizarchitect.nexus.v1.spring.fs;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.client.RestTemplate;
import org.springframework.web.reactive.function.client.WebClient;

import com.aibizarchitect.nexus.v1.spring.restfsservice.RestFsServiceClient;
import com.aibizarchitect.nexus.v1.spring.restfsservice.RestFsServiceClientBuilder;

@Configuration
public class RestFsConfig {

    @Value("${restfs.api.url}")
    private String fsApiUrl;

    @Bean
    @ConditionalOnMissingBean
    public RestTemplate restTemplate() {
        return new RestTemplate();
    }

    @Bean
    public WebClient restFsWebClient() {
        return WebClient.builder()
                .baseUrl(fsApiUrl)
                .build();
    }

    /**
     * Creates the TypeSpec-generated REST FS Service client.
     * This replaces the custom RestFsClient implementation.
     */
    @Bean
    @ConditionalOnMissingBean
    public RestFsServiceClient restFsServiceClient() {
        return new RestFsServiceClientBuilder()
                .endpoint(fsApiUrl)
                .buildClient();
    }
}
