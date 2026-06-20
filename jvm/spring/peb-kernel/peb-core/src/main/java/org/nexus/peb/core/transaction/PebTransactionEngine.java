package org.nexus.peb.core.transaction;

import org.nexus.peb.domain.entity.PebTransaction;
import org.nexus.peb.hash.service.PebHashService;
import org.nexus.peb.store.repository.PebTransactionRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Manages the low-level persistence lifecycle of a {@link PebTransaction}.
 *
 * <p><b>Transaction semantics:</b> Both {@link #beginTransaction} and
 * {@link #commitTransaction} carry their own {@code @Transactional}
 * annotation with default REQUIRED propagation. When called from within an
 * outer {@code @Transactional} scope (as they are from
 * {@link org.nexus.peb.core.engine.PebGovernanceEngine#processForPath}),
 * they join the existing transaction rather than starting a new one. The
 * outer scope thus wraps the full dispatch — validator + audit save +
 * (for REPORT_VIOLATION) first-class violation save — atomically.
 *
 * <p>Called outside an outer transaction, each method opens its own
 * independent transaction as annotated. The naming is historical:
 * {@code beginTransaction} records the transaction's entry point
 * (before-state, incoming payload) and {@code commitTransaction}
 * finalises it (after-state, hashes, committedAt stamp). In practice
 * the outer scope unifies them.
 */
@Service
public class PebTransactionEngine {

    private final PebTransactionRepository repository;
    private final PebHashService hashService;

    public PebTransactionEngine(PebTransactionRepository repository, PebHashService hashService) {
        this.repository = repository;
        this.hashService = hashService;
    }

    @Transactional
    public PebTransaction beginTransaction(PebTransaction transaction) {
        return repository.save(transaction);
    }

    @Transactional
    public PebTransaction commitTransaction(PebTransaction transaction) {
        // Compute state delta, final hashes, etc.
        return repository.save(transaction);
    }
}
