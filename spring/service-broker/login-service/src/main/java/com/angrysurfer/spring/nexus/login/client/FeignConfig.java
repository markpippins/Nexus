package com.angrysurfer.spring.nexus.login.client;

import org.springframework.cloud.openfeign.EnableFeignClients;
import org.springframework.context.annotation.Configuration;

@Configuration
@EnableFeignClients(basePackages = "com.angrysurfer.nexus.login.client")
public class FeignConfig {
}
