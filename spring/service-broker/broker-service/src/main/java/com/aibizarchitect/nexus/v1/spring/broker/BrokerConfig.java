package com.aibizarchitect.nexus.v1.spring.broker;

import org.springframework.context.annotation.ComponentScan;
import org.springframework.context.annotation.Configuration;

/**
 * Configuration class to enable component scanning for the admin logging
 * module.
 */
@Configuration
@ComponentScan(basePackages = {
        "com.aibizarchitect.nexus.broker",
        "com.aibizarchitect.nexus.admin.logging"
})
public class BrokerConfig {
    // This configuration enables component scanning for both broker and admin
    // logging packages
}