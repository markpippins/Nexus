# DBA review — Resolution v32: evaluation-context gate for `evaluate_proposition`

**Disposition: push back — do not apply unchanged.**

The evaluation-context gate is directionally correct and its most important
invariant is well chosen: a refusal is not an evaluation. Returning
`context_required` or `context_mismatch` with `all_passed = NULL`, before any
insert or proposition update, preserves that distinction and avoids emitting a
misleading `resolution_on_change` event. The four cases, the framed-dimensions
scope in D2, and dimension-scoped governed-reference lookup are all reasonable.

There is, however, one release-blocking PostgreSQL overload issue in D5.

The proposed core signature gives defaults to both trailing parameters:

```sql
evaluate_proposition(uuid, text DEFAULT 'manual', jsonb DEFAULT NULL)
```

and then creates explicit `evaluate_proposition(uuid)` and
`evaluate_proposition(uuid, text)` wrappers. PostgreSQL considers functions
callable through default arguments during overload resolution. Consequently,
an existing positional call with one argument can match both the one-argument
wrapper and the defaulted three-argument function; a two-argument call can
match both the two-argument wrapper and the defaulted three-argument function.
Those calls can fail with `function ... is not unique` rather than retaining
their promised behavior. This directly contradicts “all call sites are
untouched.”

## Required correction

Keep one public entry point for each existing arity and make only the new
three-argument implementation callable without overlap. The cleanest option
is:

```sql
CREATE OR REPLACE FUNCTION resolution.evaluate_proposition(
  p_proposition_id uuid,
  p_trigger_reason text,
  p_context jsonb
)
...

CREATE OR REPLACE FUNCTION resolution.evaluate_proposition(
  p_proposition_id uuid,
  p_trigger_reason text
)
...

CREATE OR REPLACE FUNCTION resolution.evaluate_proposition(
  p_proposition_id uuid
)
...
```

That is: **remove both defaults from the three-argument implementation**. The
two wrappers retain the legacy defaults/behavior explicitly, and callers that
want context must provide all three arguments. If named-argument callers must
be supported, keep parameter names stable in each wrapper.

## Two items to make explicit before merge

1. D3 says unknown supplied dimension names raise, but the draft validates
   context keys only when `v_framed_dim_count > 0`. For an unframed proposition,
   an unknown key is silently ignored. Either move key validation before the
   frame-count branch, or narrow D3 to “unknown keys raise for framed
   propositions.” The latter is consistent with case 1’s stated
   context-irrelevant behavior.
2. Require `p_context` to be a JSON object (or document that non-object JSON
   is intentionally allowed). `jsonb_object_keys()` on an array/scalar is an
   implementation error, not one of the defined caller-facing outcomes. A
   concise explicit `jsonb_typeof(p_context) <> 'object'` exception produces a
   much clearer contract.

## Ratification condition

I will ratify v32 once the default-argument/compatibility-wrapper collision is
removed and the intended unframed-proposition handling of unknown context keys
is stated in the migration header and tests. No schema or data migration
concerns otherwise block this function-only change.
