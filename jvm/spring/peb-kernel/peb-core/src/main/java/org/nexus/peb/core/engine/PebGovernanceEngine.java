package org.nexus.peb.core.engine;

import org.nexus.peb.core.transaction.PebTransactionEngine;
import org.nexus.peb.core.validation.InvariantValidator;
import org.nexus.peb.domain.entity.PebTransaction;
import org.springframework.stereotype.Service;

@Service
public class PebGovernanceEngine {

    private final PebTransactionEngine transactionEngine;
    private final InvariantValidator validator;

    public PebGovernanceEngine(PebTransactionEngine transactionEngine, InvariantValidator validator) {
        this.transactionEngine = transactionEngine;
        this.validator = validator;
    }

    public void process(PebTransaction request) {
        if (validator.validate(request)) {
            PebTransaction tx = transactionEngine.beginTransaction(request);
            // Process logic
            transactionEngine.commitTransaction(tx);
        }
    }
}
