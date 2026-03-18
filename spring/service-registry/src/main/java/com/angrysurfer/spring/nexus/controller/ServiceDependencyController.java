package com.angrysurfer.spring.nexus.controller;

import java.util.List;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.angrysurfer.spring.nexus.client.ServicesConsoleClient;

@RestController
@RequestMapping("/api/v1/dependencies")
@CrossOrigin(origins = "*")
public class ServiceDependencyController {

    private static final Logger log = LoggerFactory.getLogger(ServiceDependencyController.class);
    private final ServicesConsoleClient client;

    public ServiceDependencyController(ServicesConsoleClient client) {
        this.client = client;
    }

    @GetMapping
    public org.springframework.data.domain.Page<com.angrysurfer.spring.nexus.entity.ServiceDependency> getAllDependencies(org.springframework.data.domain.Pageable pageable) {
        log.info("Fetching all service dependencies from console");
        List<com.angrysurfer.spring.nexus.entity.ServiceDependency> list = client.getServiceDependencies();
        int start = (int) pageable.getOffset();
        int end = Math.min((start + pageable.getPageSize()), list.size());
        return new org.springframework.data.domain.PageImpl<>(
                (start <= end) ? list.subList(start, end) : java.util.Collections.emptyList(),
                pageable, list.size());
    }
}
