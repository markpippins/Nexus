package org.nexus.peb.api.controller;

import org.nexus.peb.core.engine.PebGovernanceEngine;
import org.nexus.peb.domain.dto.AdmissionResponse;
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

import java.util.ArrayList;
import java.util.List;

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
 *   - UNKNOWN          (present but unrecognized toolName): the request is
 *                       structurally complete, so it flows through the
 *                       invariant validator, which rejects unknown tool names
 *                       (admission_result = REJECTED, HTTP 422).
 *
 * Requests missing any persistence-required field — {@code idempotencyKey},
 * {@code entityId}, {@code toolName}, {@code input} — are malformed: they can
 * neither be routed nor recorded as an audit row, so they are rejected at the
 * boundary with HTTP 400 before reaching the engine (previously they crashed
 * at the database NOT NULL layer as HTTP 500).
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
        String missing = missingRequiredFields(transaction);
        if (missing != null) {
            return ResponseEntity.badRequest()
                .body("Malformed admission request: missing required field(s): " + missing);
        }
        AdmissionPath path = AdmissionPath.fromToolName(transaction.getToolName());
        AdmissionResponse response = governanceEngine.processForPath(transaction, path);
        if (response.admitted()) {
            return ResponseEntity.ok(response.message());
        }
        return ResponseEntity.status(HttpStatus.UNPROCESSABLE_ENTITY)
                             .body(response.message());
    }

    /**
     * Boundary check for requests that cannot be routed OR recorded.
     *
     * <p>The governance engine always persists an audit row — including for
     * validator-rejected transactions — and {@code peb.transactions} requires
     * {@code idempotency_key}, {@code entity_id}, {@code tool_name}, and
     * {@code input} to be NOT NULL. A request missing any of these is
     * malformed: it would fail at the database layer (HTTP 500) rather than
     * being cleanly rejected. Returning the field names lets the caller see
     * exactly what to fix. Real clients (peb-mcp) always send all four.
     *
     * @param transaction the deserialized request (null for a JSON null body)
     * @return comma-separated missing field names, or {@code null} if complete
     */
    private static String missingRequiredFields(PebTransaction transaction) {
        if (transaction == null) {
            return "transaction body";
        }
        List<String> missing = new ArrayList<>();
        if (isBlank(transaction.getIdempotencyKey())) missing.add("idempotencyKey");
        if (isBlank(transaction.getEntityId())) missing.add("entityId");
        if (isBlank(transaction.getToolName())) missing.add("toolName");
        if (transaction.getInput() == null) missing.add("input");
        return missing.isEmpty() ? null : String.join(", ", missing);
    }

    private static boolean isBlank(String s) {
        return s == null || s.isBlank();
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
