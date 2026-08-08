package org.nexus.peb.domain.entity;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.lang.reflect.Field;
import java.time.Instant;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;

/**
 * Tests the {@link PebTransaction} {@code @PrePersist} lifecycle callback.
 *
 * <p>Regression for the kernel 500 on every valid transaction:
 * {@code IdentifierGenerationException: Identifier of entity 'PebTransaction'
 * must be manually assigned before calling 'persist()'} — the {@code @Id} UUID
 * was never assigned by any dispatch path. {@link PebTransaction#onCreate()}
 * now defaults {@code id} (and {@code createdAt}) when null, mirroring the
 * existing timestamp default so every insert path is self-sufficient.
 */
@DisplayName("PebTransaction @PrePersist onCreate")
class PebTransactionTest {

    @Test
    @DisplayName("assigns id and createdAt when both are null")
    void assigns_id_and_createdAt_when_null() {
        PebTransaction tx = new PebTransaction();

        tx.onCreate();

        assertNotNull(tx.getId(), "id must be assigned before persist");
        assertNotNull(tx.getCreatedAt(), "createdAt must be assigned before persist");
    }

    @Test
    @DisplayName("does not overwrite a caller-assigned id")
    void preserves_caller_id() throws Exception {
        PebTransaction tx = new PebTransaction();
        UUID callerId = UUID.randomUUID();
        setField(tx, "id", callerId);

        tx.onCreate();

        assertEquals(callerId, tx.getId(), "caller-assigned id must win");
    }

    @Test
    @DisplayName("does not overwrite a caller-assigned createdAt")
    void preserves_caller_createdAt() {
        PebTransaction tx = new PebTransaction();
        Instant callerTime = Instant.parse("2026-01-01T00:00:00Z");
        tx.setCreatedAt(callerTime);

        tx.onCreate();

        assertEquals(callerTime, tx.getCreatedAt(), "caller-assigned createdAt must win");
        assertNotNull(tx.getId());
    }

    @Test
    @DisplayName("generated ids are unique across invocations")
    void generated_ids_are_unique() {
        PebTransaction a = new PebTransaction();
        PebTransaction b = new PebTransaction();
        a.onCreate();
        b.onCreate();

        assertNotEquals(a.getId(), b.getId());
    }

    private static void setField(PebTransaction tx, String name, Object value) throws Exception {
        Field field = PebTransaction.class.getDeclaredField(name);
        field.setAccessible(true);
        field.set(tx, value);
    }
}
