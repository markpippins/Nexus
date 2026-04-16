package nexus.serviceregistry.v1.controller;

import java.util.List;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import nexus.serviceregistry.v1.client.ServicesConsoleClient;

@RestController
@RequestMapping("/api/v0/dependencies")
@CrossOrigin(origins = "*")
@Deprecated(since = "v1", forRemoval = true)
public class ServiceDependencyControllerV0 {

    private static final Logger log = LoggerFactory.getLogger(ServiceDependencyControllerV0.class);
    private final ServicesConsoleClient client;

    public ServiceDependencyControllerV0(ServicesConsoleClient client) {
        this.client = client;
    }

    @GetMapping
    @Deprecated(since = "v1", forRemoval = true)
    public List<nexus.serviceregistry.v1.entity.ServiceDependency> getAllDependencies() {
        log.info("Fetching all service dependencies from console");
        return client.getServiceDependencies();
    }
}
