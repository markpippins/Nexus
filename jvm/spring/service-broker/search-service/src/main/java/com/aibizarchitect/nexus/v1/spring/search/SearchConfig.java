package com.aibizarchitect.nexus.v1.spring.search;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.web.client.RestTemplate;

@Configuration
public class SearchConfig {

    @Bean
    @org.springframework.context.annotation.Primary
    public RestTemplate restTemplate() {
        RestTemplate restTemplate = new RestTemplate();
        
        // Configure request factory with timeouts
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(10000); // 10 seconds
        factory.setReadTimeout(30000);    // 30 seconds
        
        restTemplate.setRequestFactory(factory);
        return restTemplate;
    }
}