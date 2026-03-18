package com.angrysurfer.spring.nexus.user;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.context.annotation.ComponentScan;
import org.springframework.data.mongodb.repository.config.EnableMongoRepositories;

@SpringBootApplication
@EnableMongoRepositories(basePackages = {
        "com.angrysurfer.nexus.user"
})
@ComponentScan(basePackages = {
        "com.angrysurfer.nexus.user"
})
public class TestUserServiceApplication {

    public static void main(String[] args) {
        SpringApplication.run(TestUserServiceApplication.class, args);
    }

}