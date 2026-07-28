package com.aibizarchitect.nexus.v1.spring.registry.service;

import com.aibizarchitect.nexus.v1.broker.api.ServiceRegistration;
import com.aibizarchitect.nexus.v1.broker.api.ServiceRegistration.ServiceStatus;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;

/**
 * Comprehensive test suite for {@link RegistryService}, the in-memory
 * {@link ConcurrentHashMap}-backed service registry that underpins the
 * broker-gateway's service discovery.
 *
 * <p>Follows the Tester role's four-path coverage model:
 * <ol>
 *   <li><b>Green path</b> — well-formed input, expected success</li>
 *   <li><b>Orange path</b> — expected, handled failure (not found, empty)</li>
 *   <li><b>Red path</b> — adversarial input the system must survive</li>
 *   <li><b>Silent failure</b> — metamorphic/determinism, regression locks</li>
 * </ol>
 *
 * <p>The {@code @BrokerOperation} and {@code @BrokerParam} annotations are
 * metadata consumed by the broker framework at runtime; they do not affect
 * direct method calls. All methods are tested via direct invocation.
 */
@DisplayName("RegistryService")
class RegistryServiceTest {

    private RegistryService registry;

    @BeforeEach
    void setUp() {
        registry = new RegistryService();
    }

    // ================================================================
    // Helper
    // ================================================================

    private ServiceRegistration buildRegistration(String name, List<String> operations) {
        ServiceRegistration reg = new ServiceRegistration();
        reg.setServiceName(name);
        reg.setOperations(operations);
        reg.setEndpoint("http://" + name + ":8080");
        reg.setHealthCheck("/health");
        return reg;
    }

    // ================================================================
    // GREEN PATH — well-formed input, expected success
    // ================================================================

    @Nested
    @DisplayName("Green Path")
    class GreenPath {

        @Test
        @DisplayName("register stores service and indexes operations")
        void register_storesServiceAndIndexesOperations() {
            ServiceRegistration reg = buildRegistration("test-svc", List.of("op1", "op2"));

            Map<String, String> result = registry.register(reg);

            assertAll(
                () -> assertEquals("Service registered successfully", result.get("message")),
                () -> assertEquals("test-svc", result.get("serviceName")),
                () -> assertEquals(ServiceStatus.HEALTHY, reg.getStatus()),
                () -> assertNotNull(reg.getLastHeartbeat())
            );

            // Verify it's findable
            ServiceRegistration found = registry.findByServiceName("test-svc");
            assertNotNull(found);
            assertEquals("test-svc", found.getServiceName());
        }

        @Test
        @DisplayName("findByServiceName returns registration when found")
        void findByServiceName_found() {
            registry.register(buildRegistration("svc-a", List.of("op1")));

            ServiceRegistration result = registry.findByServiceName("svc-a");

            assertNotNull(result);
            assertEquals("svc-a", result.getServiceName());
        }

        @Test
        @DisplayName("findByOperation resolves via operation index")
        void findByOperation_resolvesViaIndex() {
            registry.register(buildRegistration("svc-a", List.of("op-alpha", "op-beta")));

            ServiceRegistration result = registry.findByOperation("op-beta");

            assertNotNull(result);
            assertEquals("svc-a", result.getServiceName());
        }

        @Test
        @DisplayName("getAllServices returns registered services")
        void getAllServices_returnsRegistered() {
            registry.register(buildRegistration("svc-a", List.of("a1")));
            registry.register(buildRegistration("svc-b", List.of("b1")));

            List<ServiceRegistration> services = registry.getAllServices();

            assertEquals(2, services.size());
        }

        @Test
        @DisplayName("deregister removes from registry and operation index")
        void deregister_removesFromRegistryAndIndex() {
            registry.register(buildRegistration("svc-a", List.of("op1", "op2")));

            Map<String, String> result = registry.deregister("svc-a");

            assertEquals("Service deregistered successfully", result.get("message"));
            assertNull(registry.findByServiceName("svc-a"), "Service should be gone from registry");
            assertNull(registry.findByOperation("op1"), "Operation index should be cleaned up");
            assertNull(registry.findByOperation("op2"), "All operations should be cleaned up");
        }

        @Test
        @DisplayName("heartbeat updates timestamp and sets HEALTHY")
        void heartbeat_updatesTimestampAndStatus() {
            ServiceRegistration reg = buildRegistration("svc-a", List.of("op1"));
            reg.setStatus(ServiceStatus.UNHEALTHY);
            Instant oldHeartbeat = Instant.now().minusSeconds(60);
            reg.setLastHeartbeat(oldHeartbeat);
            registry.register(reg);

            // brief pause to ensure timestamp differs
            Map<String, String> result = registry.heartbeat("svc-a");

            assertEquals("Heartbeat received", result.get("message"));
            ServiceRegistration updated = registry.findByServiceName("svc-a");
            assertEquals(ServiceStatus.HEALTHY, updated.getStatus());
            assertTrue(updated.getLastHeartbeat().isAfter(oldHeartbeat),
                "Heartbeat timestamp should advance");
        }

        @Test
        @DisplayName("markUnhealthy sets status to UNHEALTHY")
        void markUnhealthy_setsUnhealthy() {
            ServiceRegistration reg = buildRegistration("svc-a", List.of("op1"));
            reg.setStatus(ServiceStatus.HEALTHY);
            registry.register(reg);

            registry.markUnhealthy("svc-a");

            ServiceRegistration updated = registry.findByServiceName("svc-a");
            assertEquals(ServiceStatus.UNHEALTHY, updated.getStatus());
        }

        @Test
        @DisplayName("lookupByOperation returns Optional of registration")
        void lookupByOperation_found() {
            registry.register(buildRegistration("svc-a", List.of("op1")));

            Optional<ServiceRegistration> result = registry.lookupByOperation("op1");

            assertTrue(result.isPresent());
            assertEquals("svc-a", result.get().getServiceName());
        }
    }

    // ================================================================
    // ORANGE PATH — expected, handled failure
    // ================================================================

    @Nested
    @DisplayName("Orange Path")
    class OrangePath {

        @Test
        @DisplayName("findByServiceName returns null when not found")
        void findByServiceName_notFound() {
            ServiceRegistration result = registry.findByServiceName("nonexistent");

            assertNull(result);
        }

        @Test
        @DisplayName("findByOperation returns null when not found")
        void findByOperation_notFound() {
            ServiceRegistration result = registry.findByOperation("nonexistent");

            assertNull(result);
        }

        @Test
        @DisplayName("deregister returns 'Service not found' for unknown service")
        void deregister_notFound() {
            Map<String, String> result = registry.deregister("nonexistent");

            assertEquals("Service not found", result.get("message"));
        }

        @Test
        @DisplayName("heartbeat returns 'Service not found' for unknown service")
        void heartbeat_notFound() {
            Map<String, String> result = registry.heartbeat("nonexistent");

            assertEquals("Service not found", result.get("message"));
        }

        @Test
        @DisplayName("getAllServices returns empty list when no services registered")
        void getAllServices_emptyRegistry() {
            List<ServiceRegistration> services = registry.getAllServices();

            assertTrue(services.isEmpty());
        }

        @Test
        @DisplayName("register with same name cleans old operations from index")
        void register_overwrite() {
            ServiceRegistration first = buildRegistration("svc-a", List.of("op1"));
            first.setEndpoint("http://old:8080");
            registry.register(first);

            ServiceRegistration second = buildRegistration("svc-a", List.of("op2", "op3"));
            second.setEndpoint("http://new:8080");
            registry.register(second);

            ServiceRegistration found = registry.findByServiceName("svc-a");
            assertEquals("http://new:8080", found.getEndpoint());
            assertEquals(2, found.getOperations().size(),
                "Operations should be from second registration");

            // Old operation 'op1' should be cleaned from index
            assertNull(registry.findByOperation("op1"),
                "Old operation 'op1' should be removed from index on overwrite");
            assertNotNull(registry.findByOperation("op2"),
                "New operation 'op2' should be in index");
            assertNotNull(registry.findByOperation("op3"),
                "New operation 'op3' should be in index");
        }

        @Test
        @DisplayName("lookupByOperation returns empty Optional when not found")
        void lookupByOperation_notFound() {
            Optional<ServiceRegistration> result = registry.lookupByOperation("nonexistent");

            assertFalse(result.isPresent());
        }

        @Test
        @DisplayName("findByServiceName with blank name returns null")
        void findByServiceName_blankName() {
            assertNull(registry.findByServiceName(""));
            assertNull(registry.findByServiceName("  "));
        }

        @Test
        @DisplayName("findByOperation with blank operation returns null")
        void findByOperation_blankOperation() {
            assertNull(registry.findByOperation(""));
            assertNull(registry.findByOperation("  "));
        }

        @Test
        @DisplayName("deregister with blank name returns 'Service not found'")
        void deregister_blankName_returnsNotFound() {
            assertEquals("Service not found", registry.deregister("").get("message"));
            assertEquals("Service not found", registry.deregister("  ").get("message"));
        }

        @Test
        @DisplayName("heartbeat with blank name returns 'Service not found'")
        void heartbeat_blankName_returnsNotFound() {
            assertEquals("Service not found", registry.heartbeat("").get("message"));
            assertEquals("Service not found", registry.heartbeat("  ").get("message"));
        }
    }

    // ================================================================
    // RED PATH — adversarial input the system must survive
    // ================================================================

    @Nested
    @DisplayName("Red Path")
    class RedPath {

        @Test
        @DisplayName("register with null registration returns error map")
        void register_nullRegistration_returnsError() {
            Map<String, String> result = registry.register(null);

            assertEquals("Registration cannot be null", result.get("error"));
        }

        @Test
        @DisplayName("register with null service name returns error map")
        void register_nullServiceName_returnsError() {
            ServiceRegistration reg = new ServiceRegistration();
            reg.setServiceName(null);
            reg.setOperations(List.of("op1"));
            reg.setEndpoint("http://test:8080");

            Map<String, String> result = registry.register(reg);

            assertEquals("Service name is required", result.get("error"));
            assertTrue(registry.getAllServices().isEmpty(), "Nothing should be stored");
        }

        @Test
        @DisplayName("register with blank service name returns error map")
        void register_blankServiceName_returnsError() {
            ServiceRegistration reg = buildRegistration("  ", List.of("op1"));

            Map<String, String> result = registry.register(reg);

            assertEquals("Service name is required", result.get("error"));
        }

        @Test
        @DisplayName("register with null operations list succeeds with zero indexed ops")
        void register_nullOperations_succeedsWithZeroOps() {
            ServiceRegistration reg = new ServiceRegistration();
            reg.setServiceName("svc-a");
            reg.setOperations(null);
            reg.setEndpoint("http://test:8080");

            Map<String, String> result = registry.register(reg);

            assertEquals("Service registered successfully", result.get("message"));
            assertNotNull(registry.findByServiceName("svc-a"), "Service should be stored");
        }

        @Test
        @DisplayName("register with empty operations list allowed")
        void register_emptyOperations_allowed() {
            ServiceRegistration reg = buildRegistration("svc-a", List.of());

            Map<String, String> result = registry.register(reg);

            assertEquals("Service registered successfully", result.get("message"));
            assertNotNull(registry.findByServiceName("svc-a"));
        }

        @Test
        @DisplayName("deregister with null name returns 'Service not found'")
        void deregister_nullName_returnsNotFound() {
            Map<String, String> result = registry.deregister(null);

            assertEquals("Service not found", result.get("message"));
        }

        @Test
        @DisplayName("heartbeat with null name returns 'Service not found'")
        void heartbeat_nullName_returnsNotFound() {
            Map<String, String> result = registry.heartbeat(null);

            assertEquals("Service not found", result.get("message"));
        }

        @Test
        @DisplayName("markUnhealthy with null name is no-op")
        void markUnhealthy_nullName_noOp() {
            assertDoesNotThrow(() -> registry.markUnhealthy(null));
        }

        @Test
        @DisplayName("lookupByOperation with null operation returns empty")
        void lookupByOperation_null_returnsEmpty() {
            Optional<ServiceRegistration> result = registry.lookupByOperation(null);

            assertFalse(result.isPresent());
        }

        @Test
        @DisplayName("findByOperation with XSS payload in operation name")
        void findByOperation_xssPayload_handled() {
            String xss = "<script>alert(1)</script>";
            registry.register(buildRegistration("svc-a", List.of("safe-op")));

            ServiceRegistration result = registry.findByOperation(xss);

            assertNull(result, "XSS payload should not match any operation");
        }
    }

    // ================================================================
    // SILENT FAILURE — metamorphic/determinism, regression locks
    // ================================================================

    @Nested
    @DisplayName("Silent Failure")
    class SilentFailure {

        @Test
        @DisplayName("register produces deterministic response format")
        void register_deterministicResponse() {
            ServiceRegistration reg1 = buildRegistration("svc-a", List.of("op1"));
            ServiceRegistration reg2 = buildRegistration("svc-b", List.of("op2"));

            Map<String, String> r1 = registry.register(reg1);
            Map<String, String> r2 = registry.register(reg2);

            assertEquals(r1.keySet(), r2.keySet(),
                "Registration responses should have same keys");
            assertTrue(r1.containsKey("message"));
            assertTrue(r1.containsKey("serviceName"));
        }

        @Test
        @DisplayName("deregister actually cleans operation index (metamorphic)")
        void deregister_operationIndexCleanup_verified() {
            registry.register(buildRegistration("svc-a", List.of("op1", "op2", "op3")));

            // Before deregister — all operations findable
            assertNotNull(registry.findByOperation("op1"));
            assertNotNull(registry.findByOperation("op2"));
            assertNotNull(registry.findByOperation("op3"));

            registry.deregister("svc-a");

            // After deregister — NONE should be findable
            assertNull(registry.findByOperation("op1"),
                "Metamorphic: deregister MUST remove ALL operations from index");
            assertNull(registry.findByOperation("op2"));
            assertNull(registry.findByOperation("op3"));
        }

        @Test
        @DisplayName("heartbeat actually advances timestamp (metamorphic)")
        void heartbeat_actuallyAdvancesTimestamp() {
            ServiceRegistration reg = buildRegistration("svc-a", List.of("op1"));
            Instant before = Instant.now();
            registry.register(reg);

            Instant afterRegister = registry.findByServiceName("svc-a").getLastHeartbeat();

            // Wait a few ms to ensure clock advances
            try { Thread.sleep(5); } catch (InterruptedException e) { }

            registry.heartbeat("svc-a");

            Instant afterHeartbeat = registry.findByServiceName("svc-a").getLastHeartbeat();

            assertTrue(afterHeartbeat.isAfter(afterRegister),
                "Metamorphic: heartbeat MUST advance the timestamp");
        }

        @Test
        @DisplayName("getAllServices returns independent snapshot")
        void getAllServices_immutableSnapshot() {
            registry.register(buildRegistration("svc-a", List.of("op1")));

            List<ServiceRegistration> snapshot = registry.getAllServices();
            assertEquals(1, snapshot.size());

            // Add another service via the registry
            registry.register(buildRegistration("svc-b", List.of("op2")));

            // The snapshot should still have only 1 entry
            assertEquals(1, snapshot.size(),
                "Metamorphic: getAllServices returns snapshot, not live view");

            // A new call should reflect the added service
            assertEquals(2, registry.getAllServices().size());
        }

        @Test
        @DisplayName("regression lock: deregister success response format")
        void regressionLock_deregisterSuccessFormat() {
            registry.register(buildRegistration("svc-a", List.of("op1")));

            Map<String, String> result = registry.deregister("svc-a");

            assertAll(
                () -> assertEquals("Service deregistered successfully", result.get("message"),
                    "REGRESSION LOCK: deregister success message format"),
                () -> assertEquals(1, result.size(),
                    "REGRESSION LOCK: deregister success has exactly one key")
            );
        }

        @Test
        @DisplayName("regression lock: heartbeat not-found response format")
        void regressionLock_heartbeatNotFoundFormat() {
            Map<String, String> result = registry.heartbeat("nonexistent");

            assertAll(
                () -> assertEquals("Service not found", result.get("message"),
                    "REGRESSION LOCK: heartbeat not-found message format"),
                () -> assertEquals(1, result.size(),
                    "REGRESSION LOCK: heartbeat not-found has exactly one key")
            );
        }

        @Test
        @DisplayName("markUnhealthy preserves other registration data")
        void markUnhealthy_preservesOtherData() {
            ServiceRegistration reg = buildRegistration("svc-a", List.of("op1"));
            reg.setEndpoint("http://svc-a:8080");
            reg.setStatus(ServiceStatus.HEALTHY);
            registry.register(reg);

            // Capture heartbeat AFTER register (register sets lastHeartbeat internally)
            Instant heartbeatAfterRegister = registry.findByServiceName("svc-a").getLastHeartbeat();

            registry.markUnhealthy("svc-a");

            ServiceRegistration updated = registry.findByServiceName("svc-a");
            assertAll(
                () -> assertEquals(ServiceStatus.UNHEALTHY, updated.getStatus()),
                () -> assertEquals("http://svc-a:8080", updated.getEndpoint(),
                    "Endpoint should be preserved"),
                () -> assertEquals(heartbeatAfterRegister, updated.getLastHeartbeat(),
                    "Heartbeat timestamp should be preserved"),
                () -> assertEquals(List.of("op1"), updated.getOperations(),
                    "Operations should be preserved")
            );
        }
    }

    // ================================================================
    // CONCURRENCY — basic smoke test for ConcurrentHashMap
    // ================================================================

    @Nested
    @DisplayName("Concurrency")
    class Concurrency {

        @Test
        @DisplayName("concurrent registrations do not lose data")
        void concurrentRegistrations_noDataLoss() throws Exception {
            int threadCount = 10;
            Thread[] threads = new Thread[threadCount];

            for (int i = 0; i < threadCount; i++) {
                final int idx = i;
                threads[i] = new Thread(() -> {
                    ServiceRegistration reg = buildRegistration("svc-" + idx, List.of("op-" + idx));
                    registry.register(reg);
                });
                threads[i].start();
            }

            for (Thread t : threads) {
                t.join();
            }

            assertEquals(threadCount, registry.getAllServices().size(),
                "All concurrent registrations should succeed");
            for (int i = 0; i < threadCount; i++) {
                assertNotNull(registry.findByServiceName("svc-" + i),
                    "Service svc-" + i + " should be findable");
            }
        }
    }
}
