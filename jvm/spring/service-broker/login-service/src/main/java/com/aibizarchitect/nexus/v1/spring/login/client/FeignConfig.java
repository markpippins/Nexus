package com.aibizarchitect.nexus.v1.spring.login.client;

import org.springframework.cloud.openfeign.EnableFeignClients;
import org.springframework.context.annotation.Configuration;

@Configuration
@EnableFeignClients(basePackages = "com.aibizarchitect.nexus.login.client")
public class FeignConfig {
}
