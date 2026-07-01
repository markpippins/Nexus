package com.aibizarchitect.nexus.v1.spring.usercreation.config;

import java.util.Optional;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.CommandLineRunner;
import org.springframework.stereotype.Component;

import com.aibizarchitect.nexus.v1.spring.user.model.UserRegistration;
import com.aibizarchitect.nexus.v1.spring.user.repository.UserRegistrationRepository;

@Component
public class AdminUserSeeder implements CommandLineRunner {

    private static final Logger log = LoggerFactory.getLogger(AdminUserSeeder.class);

    private final UserRegistrationRepository repository;

    @Value("${admin.password:admin}")
    private String adminPassword;

    public AdminUserSeeder(UserRegistrationRepository repository) {
        this.repository = repository;
    }

    @Override
    public void run(String... args) {
        Optional<UserRegistration> existing = repository.findByAlias("admin");

        if (existing.isEmpty()) {
            // No admin exists — create one
            UserRegistration admin = new UserRegistration();
            admin.setAlias("admin");
            admin.setEmail("admin@localhost");
            admin.setAdmin(true);
            admin.setIdentifier(adminPassword);
            repository.save(admin);
            log.info("Created admin user with configured password");
        } else {
            // Admin exists — verify/update password
            UserRegistration admin = existing.get();
            if (!adminPassword.equals(admin.getIdentifier())) {
                admin.setIdentifier(adminPassword);
                repository.save(admin);
                log.info("Updated admin user password to match application.properties");
            }
        }
    }
}
