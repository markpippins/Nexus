package org.nexus.peb.core.transaction;

import org.nexus.peb.domain.entity.PebTransaction;
import org.nexus.peb.hash.service.PebHashService;
import org.nexus.peb.store.repository.PebTransactionRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

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
