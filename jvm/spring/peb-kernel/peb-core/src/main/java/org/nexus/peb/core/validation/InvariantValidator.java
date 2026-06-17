package org.nexus.peb.core.validation;

import org.nexus.peb.domain.entity.PebTransaction;
import org.springframework.stereotype.Component;

@Component
public class InvariantValidator {

    public boolean validate(PebTransaction transaction) {
        // Implementation for core validation
        return true;
    }
}
