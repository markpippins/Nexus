package com.aibizarchitect.nexus.v1.spring;

import org.springframework.context.annotation.ComponentScan;
import org.springframework.context.annotation.Configuration;

@Configuration
@ComponentScan(basePackages = "com.aibizarchitect.nexus.admin.logging")
public class LoggingModuleConfig {
    // Configuration class to enable component scanning for the logging module
}