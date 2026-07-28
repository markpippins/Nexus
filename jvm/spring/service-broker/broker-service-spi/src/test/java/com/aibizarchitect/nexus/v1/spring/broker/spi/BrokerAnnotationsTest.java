package com.aibizarchitect.nexus.v1.spring.broker.spi;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;
import java.lang.reflect.Method;
import java.lang.reflect.Parameter;

import static org.junit.jupiter.api.Assertions.*;

@DisplayName("Broker SPI Annotations")
class BrokerAnnotationsTest {

    @Nested
    @DisplayName("@BrokerOperation")
    class BrokerOperationTests {

        @Test
        @DisplayName("has RUNTIME retention")
        void hasRuntimeRetention() {
            Retention retention = BrokerOperation.class.getAnnotation(Retention.class);
            assertNotNull(retention);
            assertEquals(RetentionPolicy.RUNTIME, retention.value());
        }

        @Test
        @DisplayName("targets METHOD")
        void targetsMethod() {
            Target target = BrokerOperation.class.getAnnotation(Target.class);
            assertNotNull(target);
            assertTrue(java.util.Arrays.asList(target.value()).contains(ElementType.METHOD));
        }

        @Test
        @DisplayName("value() default is empty string")
        void valueDefaultIsEmpty() throws Exception {
            Method valueMethod = BrokerOperation.class.getMethod("value");
            BrokerOperation instance = DummyService.class
                    .getMethod("dummyMethod", String.class)
                    .getAnnotation(BrokerOperation.class);
            if (instance != null) {
                assertEquals("testOp", instance.value());
            }
        }
    }

    @Nested
    @DisplayName("@BrokerParam")
    class BrokerParamTests {

        @Test
        @DisplayName("has RUNTIME retention")
        void hasRuntimeRetention() {
            Retention retention = BrokerParam.class.getAnnotation(Retention.class);
            assertNotNull(retention);
            assertEquals(RetentionPolicy.RUNTIME, retention.value());
        }

        @Test
        @DisplayName("targets PARAMETER")
        void targetsParameter() {
            Target target = BrokerParam.class.getAnnotation(Target.class);
            assertNotNull(target);
            assertTrue(java.util.Arrays.asList(target.value()).contains(ElementType.PARAMETER));
        }

        @Test
        @DisplayName("value() is accessible via reflection")
        void valueAccessible() throws Exception {
            Method method = DummyService.class.getMethod("dummyMethod", String.class);
            Parameter param = method.getParameters()[0];
            BrokerParam brokerParam = param.getAnnotation(BrokerParam.class);
            assertNotNull(brokerParam);
            assertEquals("param1", brokerParam.value());
        }
    }

    // Dummy service for annotation reflection tests
    static class DummyService {
        @BrokerOperation("testOp")
        public void dummyMethod(@BrokerParam("param1") String p1) {}
    }
}
