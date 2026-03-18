package com.angrysurfer.spring.nexus.controller;

import java.util.List;
import java.util.Map;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.angrysurfer.spring.nexus.client.ServicesConsoleClient;

@RestController
@RequestMapping("/api/dependencies")
@CrossOrigin(origins = "*")
public class ServiceDependencyController {

    private static final Logger log = LoggerFactory.getLogger(ServiceDependencyController.class);
    private final ServicesConsoleClient client;

    public ServiceDependencyController(ServicesConsoleClient client) {
        this.client = client;
    }

    @GetMapping
    public List<com.angrysurfer.spring.nexus.entity.ServiceDependency> getAllDependencies() {
        log.info("Fetching all service dependencies from console");
        return client.getServiceDependencies();
    }
}
