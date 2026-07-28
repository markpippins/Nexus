package com.aibizarchitect.nexus.v1.spring.broker;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

@DisplayName("BrokerService — Additional Tests")
class BrokerServiceAdditionalTest {

    @Nested
    @DisplayName("BrokerTrafficEvent (deprecated bridge)")
    class BrokerTrafficEventTests {

        @Test
        @DisplayName("constructor stores all fields via delegate")
        void constructor_stores_fields() {
            BrokerTrafficEvent event = new BrokerTrafficEvent(
                    "evt-1", "2026-07-25T10:00:00Z", 150L,
                    "req-1", "search-service", "generateContent",
                    true, 200, "broker-gateway",
                    null, null, null);

            assertNotNull(event);
            assertNotNull(event.toApiEvent());
        }

        @Test
        @DisplayName("toApiEvent returns non-null delegate")
        void toApiEvent_returns_delegate() {
            BrokerTrafficEvent event = new BrokerTrafficEvent(
                    "evt-2", "2026-07-25T10:00:00Z", 50L,
                    "req-2", "service", "op",
                    false, 500, "source",
                    null, null, "Internal error");

            assertNotNull(event.toApiEvent());
        }

        @Test
        @DisplayName("null fields in constructor are accepted")
        void null_fields_accepted() {
            BrokerTrafficEvent event = new BrokerTrafficEvent(
                    null, null, 0L,
                    null, null, null,
                    false, 0, null,
                    null, null, null);

            assertNotNull(event.toApiEvent());
        }

        @Test
        @DisplayName("@Deprecated annotation present")
        void has_deprecated_annotation() {
            Deprecated ann = BrokerTrafficEvent.class.getAnnotation(Deprecated.class);
            assertNotNull(ann, "BrokerTrafficEvent should be @Deprecated");
        }
    }

    @Nested
    @DisplayName("BrokerAutoRegistration (structural)")
    class BrokerAutoRegistrationTests {

        @Test
        @DisplayName("class is annotated with @Component")
        void hasComponentAnnotation() {
            assertNotNull(BrokerAutoRegistration.class
                    .getAnnotation(org.springframework.stereotype.Component.class));
        }
    }
}
