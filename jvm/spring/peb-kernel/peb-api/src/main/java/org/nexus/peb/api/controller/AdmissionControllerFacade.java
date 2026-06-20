package org.nexus.peb.api.controller;

import org.nexus.peb.core.engine.PebGovernanceEngine;
import org.nexus.peb.domain.entity.PebTransaction;
import org.nexus.peb.domain.enums.AdmissionPath;
import org.nexus.peb.domain.exception.MalformedAdmissionRequestException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;

/**
 * Routes incoming MintMCP calls to distinct admission paths at the kernel.
 *
 * The MCP facade (peb-mcp) sends every call to {@code POST /api/v1/peb/transaction}
 * regardless of which of its 9 governance tools was invoked. Each tool's
 * {@code toolName} rides in the JSON payload; we read it here and dispatch
 * to one of four admission paths:
 *
 *   - VALIDATE         (peb_validate_transition, peb_check_invariants,
 *                       peb_validate_transform): ALLOWED on the audit row.
 *   - MUTATE           (peb_record_decision, peb_append_trace_segment,
 *                       peb_request_clarification, peb_extension_proposal):
 *                       full admission, default ALLOWED.
 *   - REPORT_VIOLATION (peb_report_violation): bypasses invariant check,
 *                       persists REJECTED.
 *   - UNKNOWN          (anything else, including null toolName): routed through
 *                       the validator with admission_result = ROUTED so the
 *                       audit row exists but downstream agents see ambiguity.
 */
@RestController
@RequestMapping("/api/v1/peb")
public class AdmissionControllerFacade {

    private final PebGovernanceEngine governanceEngine;

    public AdmissionControllerFacade(PebGovernanceEngine governanceEngine) {
        this.governanceEngine = governanceEngine;
    }

    @PostMapping("/transaction")
    public ResponseEntity<String> submitTransaction(@RequestBody PebTransaction transaction) {
        AdmissionPath path = AdmissionPath.fromToolName(transaction.getToolName());
        String result = governanceEngine.processForPath(transaction, path);
        return ResponseEntity.ok(result);
    }

    /**
     * Maps domain-validation failures (e.g. {@code peb_report_violation} sent
     * without a valid {@code violation_type}) to HTTP 422 Unprocessable Entity.
     *
     * <p>Scoped to a typed exception on purpose: catching the broad
     * {@code IllegalArgumentException} parent would swallow programmer-bug
     * IAE throws from future code paths as a clean 422, hiding real kernel
     * failures. The kernel raises specifically
     * {@link MalformedAdmissionRequestException}; anything else (including
     * {@code IllegalArgumentException} from a future bug) bubbles up here
     * unmapped and surfaces as a 500.
     */
    @ExceptionHandler(MalformedAdmissionRequestException.class)
    public ResponseEntity<String> handleMalformedAdmissionRequest(MalformedAdmissionRequestException ex) {
        return ResponseEntity.status(HttpStatus.UNPROCESSABLE_ENTITY)
                             .body("Malformed admission request: " + ex.getMessage());
    }
}
