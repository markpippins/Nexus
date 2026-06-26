# MCP Smoke Verification — Post-Batch Changes

**Date:** 2026-06-19

## Verification Results

**Smoke:** `smoke_kernel.sh` → exit 0, all paths green.

| Scenario | Response | DB State |
|---|---|---|
| MUTATE (peb_record_decision) | `"Mutation processed"` (text/plain) | 1 audit row |
| Valid violation (peb_report_violation) | `"Violation recorded as REJECTED"` (text/plain) | 1 audit + 1 violation row |
| Malformed (no violation_type) | 422 JSON: `{error, admission_result, message}` | 0 rows (atomic rollback) |

**Verified:**

1. **PebViolation @PrePersist createdAt** — violation row created with automatically-stamped `createdAt` (no explicit timestamp in request).
2. **422 @ExceptionHandler** — clean JSON error body, no fallback 500.
3. **PebApiClient.text() fix** — success path returns trimmed text, not spurious `{error:true, ...}`.
4. **DB counts** — 2 audit + 1 violation total; malformed rollback leaves 0 rows.
