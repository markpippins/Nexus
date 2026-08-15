-- W1.4: cascade.events is the canonical event store and NATS is downstream
-- fan-out. The old publish log has zero rows and zero runtime writers.
BEGIN;
DROP TABLE IF EXISTS cascade.nats_publish_log;
COMMIT;
