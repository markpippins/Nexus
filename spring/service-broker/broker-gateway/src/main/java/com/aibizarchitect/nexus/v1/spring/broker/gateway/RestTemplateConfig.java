package com.aibizarchitect.nexus.v1.spring.broker.gateway;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.client.RestTemplate;

@Configuration
public class RestTemplateConfig {

    @Bean("gatewayRestTemplate")
    public RestTemplate restTemplate() {
        return new RestTemplate();
    }
}