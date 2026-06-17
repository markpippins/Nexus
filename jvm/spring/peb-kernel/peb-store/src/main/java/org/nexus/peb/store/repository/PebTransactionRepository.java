package org.nexus.peb.store.repository;

import org.nexus.peb.domain.entity.PebTransaction;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;
import java.util.UUID;

@Repository
public interface PebTransactionRepository extends JpaRepository<PebTransaction, UUID> {
    Optional<PebTransaction> findByIdempotencyKey(String idempotencyKey);
}
