package com.aibizarchitect.nexus.v1.spring.broker.gateway;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.context.annotation.ComponentScan;
import org.springframework.data.mongodb.repository.config.EnableMongoRepositories;

@SpringBootApplication
@EnableMongoRepositories(basePackages = {
        "com.aibizarchitect.nexus.v1.spring.broker",
        "com.aibizarchitect.nexus.v1.spring.user",
        "com.aibizarchitect.nexus.v1.spring.fs",
        "com.aibizarchitect.nexus.v1.spring.login",
        "com.aibizarchitect.nexus.v1.spring.note",
        "com.aibizarchitect.nexus.v1.spring.search",
        "com.aibizarchitect.nexus.v1.spring.registry",
        "com.aibizarchitect.nexus.v1.spring.admin.logging"
})@ComponentScan(basePackages = {
        "com.aibizarchitect.nexus.v1.spring.broker",
        "com.aibizarchitect.nexus.v1.spring.user",
        "com.aibizarchitect.nexus.v1.spring.fs",
        "com.aibizarchitect.nexus.v1.spring.login",
        "com.aibizarchitect.nexus.v1.spring.note",
        "com.aibizarchitect.nexus.v1.spring.search",
        "com.aibizarchitect.nexus.v1.spring.registry",
        "com.aibizarchitect.nexus.v1.spring.admin.logging"
})
public class BrokerGatewayApplication {

    public static void main(String[] args) {
        SpringApplication.run(BrokerGatewayApplication.class, args);
    }

}