package com.angrysurfer.helidon.nexus.helidon;

import io.helidon.microprofile.server.Server;
import jakarta.ws.rs.client.Client;
import jakarta.ws.rs.client.ClientBuilder;
import jakarta.ws.rs.client.WebTarget;
import jakarta.ws.rs.core.Response;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;

import static org.hamcrest.MatcherAssert.assertThat;
import static org.hamcrest.Matchers.is;

class MainTest {

    private static Server server;
    private static Client client;

    @BeforeAll
    static void startServer() {
        server = Server.builder().build();
        server.start();
        client = ClientBuilder.newClient();
    }

    @AfterAll
    static void stopServer() {
        if (client != null) {
            client.close();
        }
        if (server != null) {
            server.stop();
        }
    }

    @Test
    void testHealthEndpoint() {
        WebTarget target = client.target("http://localhost:" + server.port() + "/health");
        Response response = target.request().get();
        assertThat(response.getStatus(), is(200));
    }
}
