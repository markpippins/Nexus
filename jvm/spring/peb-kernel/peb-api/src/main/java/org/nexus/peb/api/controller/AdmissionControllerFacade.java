package org.nexus.peb.api.controller;

import org.nexus.peb.core.engine.PebGovernanceEngine;
import org.nexus.peb.domain.entity.PebTransaction;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.RequestMapping;
import org.springframework.web.bind.RestController;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;

@RestController
@RequestMapping("/api/v1/peb")
public class AdmissionControllerFacade {

    private final PebGovernanceEngine governanceEngine;

    public AdmissionControllerFacade(PebGovernanceEngine governanceEngine) {
        this.governanceEngine = governanceEngine;
    }

    @PostMapping("/transaction")
    public ResponseEntity<String> submitTransaction(@RequestBody PebTransaction transaction) {
        governanceEngine.process(transaction);
        return ResponseEntity.ok("Transaction processed");
    }
}
