-- =============================================================================
-- V145 (Lilac Wave 1, plan 8261639 / Stage C): C2 trailing-24h gate — the
-- executable form of the flip #1 (conduit-mcp → enforce) gate definition.
-- =============================================================================
-- Ratified inputs:
--   * Q-B (daae50b0): legacy courtesy failure = `legacy_shadow_failed` +
--     red soak day (expected during Stage C, NOT paged); ALERT ONLY on
--     conflict/refused from REAL writers.
--   * C2 (architect review d4c0a9ff): canary exclusion must key on the
--     DECLARED canary identity (the reserved `rec-zz-redirect-`
--     source_receipt_id prefix — part of row identity at write time), never
--     on inference, so a mislabeled canary cannot mask a real refusal.
--   * Q-A: the gate is per-producer (the flip #1 gate is `conduit-mcp`).
--
-- What this adds:
--   1. `resolution.producer_refusals` — durable, append-only event surface
--      for redirect=enforce refusals of REAL writers (leg 1 of the gate).
--      Refusals of canary writers (declared `rec-zz-redirect-` prefix) are
--      recorded by the adapter as `legacy_shadow_failed` evidence (leg 2),
--      NOT here — so this table is the real-writer refusal stream by
--      construction.
--   2. `resolution.c2_trailing_gate(producer text, hours int DEFAULT 24)` —
--      the C2 gate: returns jsonb { satisfied, producer, window_hours,
--      since, real_refusals, non_canary_shadow_failures }. Satisfied iff
--      both legs are zero inside the trailing window:
--        leg 1: count of producer_refusals for THIS producer, excluding the
--               declared canary namespace by identity (defense in depth —
--               the adapter already never inserts canary refusals; the gate
--               does not depend on that discipline holding).
--        leg 2: legacy_shadow_failed events (from soak_evidence) whose
--               source_receipt_id does NOT start with 'rec-zz-redirect-'
--      Events older than the window are out of scope by design (trailing).
--      F1 (architect review 2026-09-07): the window keys on the EVENT's own
--      `recorded_at`, NOT the row's `created_at` — soak_evidence rows are
--      UPSERTed per day, so created_at is the first event's time and a real
--      refusal appended late in the day would otherwise escape the window.
--
-- Idempotent / reversible:
--   DROP FUNCTION ...; DROP TABLE ...;  (no data movement; the table starts
--   empty and is written only by the adapter in enforce mode.)
-- =============================================================================

BEGIN;

-- ── 1. Real-writer refusal stream (C2 leg 1) ────────────────────────────────
CREATE TABLE IF NOT EXISTS resolution.producer_refusals (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  producer_id       text NOT NULL,
  receipt_type      text NOT NULL,
  source_receipt_id text NOT NULL,
  plan_id           text,
  sqlstate          text,
  error             text NOT NULL,
  recorded_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_producer_refusals_producer_time
  ON resolution.producer_refusals (producer_id, recorded_at);

COMMENT ON TABLE resolution.producer_refusals IS
  'Stage C C2 gate (Q-B alert class): redirect=enforce refusals of REAL writers. Canary writers (declared rec-zz-redirect- prefix) are excluded by construction — their refusals are legacy_shadow_failed evidence instead. Append-only.';

-- ── 2. The C2 trailing-24h gate (executable gate definition) ───────────────
CREATE OR REPLACE FUNCTION resolution.c2_trailing_gate(
    p_producer text,
    p_hours    integer DEFAULT 24
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_since        timestamptz := now() - make_interval(hours => p_hours);
  v_refusals     bigint;
  v_shadow_bad   bigint;
  v_result       jsonb;
  v_ok           boolean;
BEGIN
  -- Leg 1: real-writer refusals for THIS producer (Q-A blast radius).
  -- The declared canary namespace is excluded by identity (defense in
  -- depth): the adapter never writes canary refusals here, and the gate
  -- must not depend on that discipline holding.
  SELECT count(*) INTO v_refusals
  FROM resolution.producer_refusals
  WHERE producer_id = p_producer
    AND recorded_at >= v_since
    AND source_receipt_id NOT LIKE 'rec-zz-redirect-%';

  -- Leg 2: non-canary legacy_shadow_failed events. The declared canary
  -- namespace ('rec-zz-redirect-' source_receipt_id prefix, C2) is excluded
  -- by identity, never by inference. One legacy_shadow_failed event =
  -- one jsonb array element on that day's soak_evidence row.
  -- F1 (architect review 2026-09-07): window on the EVENT's own
  -- `recorded_at` — the row is UPSERTed per day, so `created_at` is the
  -- first event's time and late-in-day events would escape the window.
  -- Malformed/missing event timestamps FAIL CLOSED: an unparseable stamp
  -- raises InvalidDatetimeFormat (the gate ERRORS — never silently green);
  -- a NULL/empty stamp is COALESCEd to now() = always in-window = counted.
  -- The adapter always writes recorded_at; these branches are defensive.
  SELECT count(*) INTO v_shadow_bad
  FROM resolution.soak_evidence se,
       jsonb_array_elements(
         COALESCE(se.report->'legacy_shadow_failed', '[]'::jsonb)) ev
  WHERE COALESCE(
          CASE
            WHEN ev->>'recorded_at' IS NULL OR ev->>'recorded_at' = ''
              THEN NULL
            ELSE (ev->>'recorded_at')::timestamptz
          END, now())
          >= now() - make_interval(hours => p_hours)
    AND (ev->>'source_receipt_id') NOT LIKE 'rec-zz-redirect-%';

  v_ok := (v_refusals = 0) AND (v_shadow_bad = 0);
  v_result := jsonb_build_object(
    'satisfied', v_ok,
    'producer', p_producer,
    'window_hours', p_hours,
    'since', v_since,
    'real_refusals', v_refusals,
    'non_canary_shadow_failures', v_shadow_bad
  );
  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION resolution.c2_trailing_gate(text, integer) IS
  'Stage C C2 gate (d4c0a9ff): trailing-24h zero-alert check for a per-producer enforce flip. Leg 1 = real-writer refusals (producer_refusals); leg 2 = non-canary legacy_shadow_failed events (declared rec-zz-redirect- prefix excluded by identity), windowed on each EVENT''s recorded_at (F1: rows are upserted per day, so the row clock is not the event clock). Missing/malformed event timestamps fail closed. Satisfied iff both are zero in the window.';

COMMIT;
