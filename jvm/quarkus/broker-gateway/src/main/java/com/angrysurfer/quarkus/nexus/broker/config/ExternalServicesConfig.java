package com.angrysurfer.quarkus.nexus.broker.config;

import java.util.Map;

import io.smallrye.config.ConfigMapping;

@ConfigMapping(prefix = "external.services")
public interface ExternalServicesConfig {
    Map<String, String> urls();
}
