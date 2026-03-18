package com.angrysurfer.spring.nexus.admin.logging;

import org.springframework.context.annotation.ComponentScan;
import org.springframework.context.annotation.Configuration;

@Configuration
@ComponentScan(basePackages = "com.angrysurfer.nexus.admin.logging")
public class LoggingModuleConfig {
    // Configuration class to enable component scanning for the logging module
}