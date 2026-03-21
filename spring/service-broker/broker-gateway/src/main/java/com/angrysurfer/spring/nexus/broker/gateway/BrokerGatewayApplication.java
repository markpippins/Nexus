package com.angrysurfer.spring.nexus.broker.gateway;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.context.annotation.ComponentScan;
import org.springframework.data.mongodb.repository.config.EnableMongoRepositories;

@SpringBootApplication
@EnableMongoRepositories(basePackages = {
        "com.angrysurfer.spring.nexus.broker",
        "com.angrysurfer.spring.nexus.user",
        "com.angrysurfer.spring.nexus.fs",
        "com.angrysurfer.spring.nexus.login",
        "com.angrysurfer.spring.nexus.note",
        "com.angrysurfer.spring.nexus.search",
        "com.angrysurfer.spring.nexus.registry",
        "com.angrysurfer.spring.nexus.admin.logging"
})
@ComponentScan(basePackages = {
        "com.angrysurfer.spring.nexus.broker",
        "com.angrysurfer.spring.nexus.user",
        "com.angrysurfer.spring.nexus.fs",
        "com.angrysurfer.spring.nexus.login",
        "com.angrysurfer.spring.nexus.note",
        "com.angrysurfer.spring.nexus.search",
        "com.angrysurfer.spring.nexus.registry",
        "com.angrysurfer.spring.nexus.admin.logging"
})
public class BrokerGatewayApplication {

    public static void main(String[] args) {
        SpringApplication.run(BrokerGatewayApplication.class, args);
    }

}