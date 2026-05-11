package com.angrysurfer.helidon.nexus.registration;

import jakarta.annotation.PostConstruct;
import jakarta.annotation.PreDestroy;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;

@ApplicationScoped
public class ServiceRegistrationLifecycle {

    @Inject
    private ServiceRegistryRegistrationService registrationService;

    @PostConstruct
    public void initialize() {
        registrationService.registerService();
    }

    @PreDestroy
    public void cleanup() {
        registrationService.cleanup();
    }
}
