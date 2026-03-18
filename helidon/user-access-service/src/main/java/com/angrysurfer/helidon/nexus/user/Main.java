package com.angrysurfer.helidon.nexus.user;

import io.helidon.microprofile.server.Server;

import java.io.IOException;
import java.util.logging.LogManager;

public class Main {

    public static void main(String[] args) throws IOException {
        // Load logging configuration
        LogManager.getLogManager().readConfiguration(
            Main.class.getResourceAsStream("/logging.properties"));

        Server server = Server.builder().build();

        // Start the server
        server.start();

        System.out.println("Server is running on: " + server.port());
        System.out.println("Health endpoint: http://localhost:" + server.port() + "/health");
        System.out.println("OpenAPI endpoint: http://localhost:" + server.port() + "/openapi");
        System.out.println("User endpoint: http://localhost:" + server.port() + "/api/user");

        // Server threads are not daemon, so we can just sleep
        try {
            Thread.currentThread().join();
        } catch (InterruptedException e) {
            System.out.println("Main thread interrupted, exiting...");
            Thread.currentThread().interrupt();
        }
    }
}
