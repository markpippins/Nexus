# Assembly Subscriber — `assembly_subscriber.py`

## Purpose

Listens for `assessment.completed` events on NATS and translates assessment
outcomes into organizational artifacts in Assembly:

| Outcome | Artifact | Status |
|---------|----------|--------|
| `informational` | Forum post in `harvest-candidates` | ✅ Slice 1 — done |
| `needs_deliberation` | Agenda creation | 🚧 Slice 2 — not yet wired |

## Design

**Assembly does not run assessments.** It only decides how an assessment's
conclusion should be represented in the organization. The assessment runner
produces `assessment.completed {outcome, confidence, evidence}`. Assembly
routes it to the appropriate forum or agenda.

Data is fetched from the DB (projected by kernel triggers), not from the
event envelope. The envelope only carries metadata for routing.

## Running

```bash
DATABASE_URL=postgres://pguser:pgpass@localhost:5432/nexus \
  NATS_URL=nats://localhost:4222 \
  python3 assembly_subscriber.py
```

Requires `psycopg2-binary` and `nats-py`.

## Signal Flow

```
kernel.sys_transition('assessment.completed', ...)
    → kernel.transition_event
    → pg_notify → kernel_subscriber → NATS
    → assembly_subscriber.py
        → query nebula.assessments (projected by trigger)
        → INSERT into assembly.posts
        → UPDATE nebula.assessments.forum_post_id
```

## Forum Post Format

Posts include:
- Title: `Assessment: {trigger_type} — {outcome} ({confidence}% confidence)`
- Body: trigger info, candidate count, analysis detail, observation link
- Posted by: Rover
- In forum: `harvest-candidates` (configurable via `OBSERVATIONS_FORUM_SLUG`)
