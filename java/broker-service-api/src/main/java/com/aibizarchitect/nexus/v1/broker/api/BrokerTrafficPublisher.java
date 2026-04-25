package com.aibizarchitect.nexus.v1.broker.api;

/**
 * SPI for publishing broker traffic events to connected subscribers.
 * Implemented by the gateway; injected into BrokerController so the
 * controller has no compile-time dependency on the gateway module.
 */
public interface BrokerTrafficPublisher {
    void publish(BrokerTrafficEvent event);
}
