package com.angrysurfer.spring.nexus.broker;

import org.springframework.context.annotation.ComponentScan;
import org.springframework.context.annotation.Configuration;

/**
 * Configuration class to enable component scanning for the admin logging
 * module.
 */
@Configuration
@ComponentScan(basePackages = {
        "com.angrysurfer.nexus.broker",
        "com.angrysurfer.nexus.admin.logging"
})
public class BrokerConfig {
    // This configuration enables component scanning for both broker and admin
    // logging packages
}