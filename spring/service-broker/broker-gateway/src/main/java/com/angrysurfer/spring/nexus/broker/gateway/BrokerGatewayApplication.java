package com.angrysurfer.spring.nexus.broker.gateway;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.context.annotation.ComponentScan;
import org.springframework.context.annotation.FilterType;
import org.springframework.data.mongodb.repository.config.EnableMongoRepositories;

import com.angrysurfer.spring.nexus.broker.BrokerController;

@SpringBootApplication
@EnableMongoRepositories(basePackages = {
        "com.angrysurfer.nexus.broker",
        "com.angrysurfer.nexus.user",
        "com.angrysurfer.nexus.fs",
        "com.angrysurfer.nexus.login",
        "com.angrysurfer.nexus.note",
        "com.angrysurfer.nexus.search",
        "com.angrysurfer.nexus.registry",
        "com.angrysurfer.nexus.admin.logging"
})
@ComponentScan(basePackages = {
        "com.angrysurfer.nexus.broker",
        "com.angrysurfer.nexus.user",
        "com.angrysurfer.nexus.fs",
        "com.angrysurfer.nexus.login",
        "com.angrysurfer.nexus.note",
        "com.angrysurfer.nexus.search",
        "com.angrysurfer.nexus.registry",
        "com.angrysurfer.nexus.admin.logging"
}, excludeFilters = @ComponentScan.Filter(type = FilterType.ASSIGNABLE_TYPE, classes = BrokerController.class))
public class BrokerGatewayApplication {

    public static void main(String[] args) {
        SpringApplication.run(BrokerGatewayApplication.class, args);
    }

}