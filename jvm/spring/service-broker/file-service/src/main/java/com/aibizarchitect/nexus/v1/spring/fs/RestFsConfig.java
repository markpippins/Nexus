package com.aibizarchitect.nexus.v1.spring.fs;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.client.RestTemplate;
import org.springframework.web.reactive.function.client.WebClient;

@Configuration
public class RestFsConfig {

    private static final Logger log = LoggerFactory.getLogger(RestFsConfig.class);

    @Value("${restfs.api.url}")
    private String fsApiUrl;

    @Bean
    @ConditionalOnMissingBean
    public RestTemplate restTemplate() {
        log.info("Creating RestTemplate bean for file-service");
        return new RestTemplate();
    }

    @Bean
    public WebClient restFsWebClient() {
        log.info("Creating WebClient bean for file-service, baseUrl: {}", fsApiUrl);
        return WebClient.builder()
                .baseUrl(fsApiUrl)
                .build();
    }
}
