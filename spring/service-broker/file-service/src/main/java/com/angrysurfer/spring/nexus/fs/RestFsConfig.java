package com.angrysurfer.spring.nexus.fs;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.client.RestTemplate;
import org.springframework.web.reactive.function.client.WebClient;

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
}
