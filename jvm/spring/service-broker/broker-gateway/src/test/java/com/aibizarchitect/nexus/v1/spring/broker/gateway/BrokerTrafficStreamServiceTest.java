package com.aibizarchitect.nexus.v1.spring.broker.gateway;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;

import org.junit.jupiter.api.Test;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import com.aibizarchitect.nexus.v1.broker.api.BrokerTrafficEvent;

class BrokerTrafficStreamServiceTest {

    @Test
    void subscribeRegistersEmitterAndCompletionRemovesIt() {
        BrokerTrafficStreamService service = new BrokerTrafficStreamService();

        SseEmitter emitter = service.subscribe();

        assertNotNull(emitter);
        assertEquals(1, service.subscriberCount());

        service.shutdown();
        assertEquals(0, service.subscriberCount());
    }

    @Test
    void multipleSubscribersCanBeRegisteredTogether() {
        BrokerTrafficStreamService service = new BrokerTrafficStreamService();

        SseEmitter first = service.subscribe();
        SseEmitter second = service.subscribe();

        assertNotNull(first);
        assertNotNull(second);
        assertEquals(2, service.subscriberCount());

        service.publish(new BrokerTrafficEvent(
                "evt-1",
                "2026-04-23T00:00:00Z",
                5L,
                "req-1",
                "loginService",
                "login",
                true,
                200,
                "BrokerController.submitRequest",
                null,
                null,
                null));
        service.sendHeartbeat();

        service.shutdown();
        assertEquals(0, service.subscriberCount());
    }
}
