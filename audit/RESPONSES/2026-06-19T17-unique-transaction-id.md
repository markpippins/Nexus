# UNIQUE Constraint on peb_violations.transaction_id — Results

**Build:** `mvn clean install` → BUILD SUCCESS (10.6s)
**Tests:** 8 run, 0 failures

## Change

Created `peb-store/src/main/resources/db/migration/V2__unique_transaction_id.sql`:

```sql
ALTER TABLE peb_violations
    ADD CONSTRAINT uq_peb_violations_transaction_id UNIQUE (transaction_id);
```

- Constraint name is 34 characters — well within PostgreSQL's 63-char `NAMEDATALEN` limit.
- Multi-NULL behavior is safe: PostgreSQL UNIQUE treats NULLs as distinct, so null `transaction_id` rows (if any) are unaffected.
- Reviewer flagged existing-data risk: if a long-lived database already has duplicate `transaction_id` rows, this migration will fail at apply time. Comment in the SQL warns about this. Mitigation options: dedup CTE first, or use a partial unique index.
