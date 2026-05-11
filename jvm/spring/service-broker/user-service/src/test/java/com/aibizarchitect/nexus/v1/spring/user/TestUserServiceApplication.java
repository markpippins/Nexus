package com.aibizarchitect.nexus.v1.spring.user;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.context.annotation.ComponentScan;
import org.springframework.data.mongodb.repository.config.EnableMongoRepositories;

@SpringBootApplication
@EnableMongoRepositories(basePackages = {
        "com.aibizarchitect.nexus.user"
})
@ComponentScan(basePackages = {
        "com.aibizarchitect.nexus.user"
})
public class TestUserServiceApplication {

    public static void main(String[] args) {
        SpringApplication.run(TestUserServiceApplication.class, args);
    }

}