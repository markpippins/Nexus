package com.aibizarchitect.nexus.v1.spring.topology;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.data.jpa.repository.config.EnableJpaRepositories;

@SpringBootApplication
@EnableJpaRepositories(basePackages = "com.aibizarchitect.nexus.v1.spring.topology.repository")
public class TopologyServerApplication {
    public static void main(String[] args) {
        SpringApplication.run(TopologyServerApplication.class, args);
    }
}
