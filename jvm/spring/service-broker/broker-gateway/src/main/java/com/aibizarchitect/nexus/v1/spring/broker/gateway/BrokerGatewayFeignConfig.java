package com.aibizarchitect.nexus.v1.spring.broker.gateway;

import org.springframework.cloud.openfeign.EnableFeignClients;
import org.springframework.context.annotation.Configuration;

@Configuration
@EnableFeignClients(basePackages = "com.aibizarchitect.nexus.v1.spring.login.client")
public class BrokerGatewayFeignConfig {
}
