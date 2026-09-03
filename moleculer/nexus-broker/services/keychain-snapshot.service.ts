import "dotenv/config";
import { randomUUID } from "crypto";
import { Service, ServiceBroker, Context } from "moleculer";
import { Pool, PoolClient } from "pg";
import { MongoClient } from "mongodb";

/**
 * KEYCHAIN SNAPSHOT service (renamed from sol-ir-snapshot per D-2026-08-31 keychains).
 *
 * Formerly sol-ir-snapshot.service.ts (itself formerly solir.service.ts). This is
 * a one-way Mongo PROJECTION consumer — nothing named keychains here is
 * operational authority; the canonical substrate is the resolution schema
 * (see authority-matrix.json domain sol_ir).
 *
 * Two projection domains:
 *
 * 1. Observations/Assessments (legacy):
 *    Periodically snapshots the canonical resolution state (PostgreSQL:
 *    nebula.observations_history / nebula.assessments_history — per
 *    D-2026-08-14-003 PostgreSQL stays canonical) into the MongoDB keychains
 *    projection store, then re-evaluates the previous observation
 *    set to emit drift findings.
 *
 * 2. Agent Records (keychain contextual layer):
 *    Projects nebula.agent_records into keychain.entries — one document per
 *    **logical record instance** containing the **current (latest) issuance**
 *    only. Historical issuances are not duplicated; supersession chains are
 *    resolved so the keychain holds R → v5 (latest), not v1–v5 as separate
 *    documents. Provenance (who, when, supersedes) is preserved.
 *    This is the contextual instance layer: "what the next turn knows."
 *
 * One-way projection: PG -> Mongo. Mongo is never read back as operational
 * state (D-2026-08-14-003).
 */

interface Observation {
  id: string;
  trigger_type: string;
  source_artifact_type: string | null;
  source_artifact_id: string | null;
  payload: any;
  assessed: boolean;
  created_at: string;
}

interface Assessment {
  id: string;
  observation_id: string;
  outcome: string;
  confidence: number | null;
  impact_scope: any;
  open_questions: any;
  analysis_detail: string | null;
  created_at: string;
}

/** A row from nebula.agent_records. */
interface AgentRecord {
  id: string;
  record_type: string;
  role: string;
  title: string;
  content: string;
  source_path: string | null;
  metadata: any;
  tags: string[];
  system_id: string | null;
  subsystem_id: string | null;
  feature_id: string | null;
  plan_ref: string | null;
  candidate_id: string | null;
  requirement_id: string | null;
  created_at: Date;
  level: number;
  visibility_scope: string;
  model: string | null;
}

/** A canonical asset reference (semantics.canonical_asset). */
interface AssetRef {
  canonical_asset_id: string;
  asset_kind: string;
}

interface OutboxRow {
  id: string;
  source_namespace: string;
  source_event_id: string;
  event_kind: string;
  outcome: string;
  schema_version: number;
  aggregate_id: string | null;
  causation_id: string | null;
  correlation_id: string | null;
  actor: string | null;
  contract_id: string | null;
  evaluator_id: string | null;
  law_id: string | null;
  effective_at: string | null;
  recorded_at: string;
  read_set: any;
  payload: any;
  checkpoint_status: string;
  delivery_attempts: number;
}

/**
 * A normalized snapshot-trigger event (shared trigger contract, per the
 * Analyst keychains trigger catalogue 332d6831).
 *
 * A trigger is a successful governed state transition / decision point.
 * `idempotency_key` = `${kind}:${id}` so the same logical decision point
 * can never create two indistinguishable snapshots.
 */
interface TriggerEventContract {
  schema_version?: number;
  source_namespace?: string | null;
  source_event_id?: string | null;
  event_id?: string | null;
  kind: string;
  id?: string | null;
  outcome?: string | null;
  aggregate_id?: string | null;
  actor?: string | null;
  source?: string | null;
  correlation_id?: string | null;
  contract_id?: string | null;
  evaluator_id?: string | null;
  law_id?: string | null;
  effective_at?: string | null;
  recorded_at?: string | null;
  meta?: any;
  read_set?: any;
  payload?: any;
  checkpoint_status?: string;
  /** Raw legacy trigger string (backward compat only). */
  raw?: string;
  idempotency_key?: string;
}

/** A resolved keychain entry — one per logical record instance. */
interface KeychainEntry {
  instance_id: string;
  record_type: string;
  role: string;
  /** Asset of the instance's CURRENT record (instance-level; advances with it). */
  asset_id: string | null;
  asset_kind: string | null;
  current: {
    record_id: string;
    version: number;
    title: string;
    content: string;
    tags: string[];
    level: number;
    visibility_scope: string;
    model: string | null;
    created_at: string;
  };
  provenance: {
    issued_by: string;
    issued_at: string;
    supersedes: string | null;
    supersession_type: "amendment" | "explicit" | "none";
    chain_length: number;
    chain_ids: string[];
  };
  snapshot_version: number;
  projected_at: string;
}

const PG_CONFIG = {
  host: process.env.PG_HOST || "localhost",
  port: Number(process.env.PG_PORT || 5432),
  user: process.env.PG_USER || "pguser",
  password: process.env.PG_PASSWORD || "pgpass",
  database: process.env.PG_DB_NAME || "nexus",
};

const MONGO_URL = process.env.MONGO_URL || "mongodb://localhost:27017";

export default class KeychainService extends Service {
  private pool: Pool | null = null;
  private mongo: MongoClient | null = null;
  private sourcePools: Map<string, Pool> = new Map();
  private outboxTimer: ReturnType<typeof setInterval> | null = null;
  private outboxPollInFlight = false;
  private agentProjectionLock: Promise<void> = Promise.resolve();
  private readonly checkpointReservationTtlMs = 5 * 60 * 1000;

  constructor(broker: ServiceBroker) {
    super(broker);

    this.parseServiceSchema({
      name: "keychain-snapshot",

      actions: {
        snapshot: {
          async handler(ctx: Context) {
            return this.runSnapshot(ctx.params as any);
          },
        },

        status: {
          async handler() {
            const client = await this.getMongo();
            const db = client.db("keychains");
            const latest = await db.collection("snapshots").findOne({}, { sort: { version: -1 } });
            return {
              enabled: true,
              intervalMs: Number(process.env.KEYCHAIN_SYNC_INTERVAL_MS || 60000),
              latestSnapshot: latest ? latest.version : null,
              latestSnapshotAt: latest ? latest.created_at : null,
            };
          },
        },

        agentRecordsSnapshot: {
          async handler(ctx: Context) {
            return this.runAgentRecordsProjection(ctx.params as any);
          },
        },

        agentRecordsTransitions: {
          async handler(ctx: Context) {
            const client = await this.getMongo();
            const db = client.db("keychains");
            const limit = Math.min(Number((ctx.params as any)?.limit || 50), 200);
            const items = await db
              .collection("transitions")
              .find({})
              .sort({ created_at: -1 })
              .limit(limit)
              .toArray();
            return { count: items.length, items };
          },
        },

        agentRecordsRewind: {
          /**
           * Rewind: reconstruct the state vector as of a past snapshot
           * version (a decision point). Returns the per-record-type
           * active-instance manifest from that snapshot (D1). Content of
           * records listed there lives in PG/Shrapnel referenced by
           * record_id — keychains is the state vector, not the archive.
           */
          async handler(ctx: Context) {
            const client = await this.getMongo();
            const db = client.db("keychains");
            const rawVersion = (ctx.params as any)?.at || (ctx.params as any)?.version;
            const version = Number(rawVersion);
            if (!version || version < 1) {
              return { ok: false, error: "version must be a positive integer (e.g. ?at=3)" };
            }
            const snap = await db.collection("ar_snapshots").findOne({
              version,
              $or: [{ checkpoint_status: "committed" }, { checkpoint_status: { $exists: false } }],
            });
            if (!snap) {
              return { ok: false, error: `no snapshot v${version} exists` };
            }
            const stateVector = (snap as any).state_vector;
            if (!stateVector) {
              return {
                ok: true,
                version: snap.version,
                label: snap.label,
                created_at: snap.created_at,
                trigger: (snap as any).trigger || null,
                note: "state_vector not present on this snapshot (pre-D1 rework) — only counts available",
                typeBreakdown: (snap as any).typeBreakdown || null,
                state_vector: null,
              };
            }
            return {
              ok: true,
              version: snap.version,
              label: snap.label,
              created_at: snap.created_at,
              trigger: (snap as any).trigger || null,
              totalRecords: (snap as any).totalRecords || null,
              entryCount: (snap as any).entryCount || null,
              recordTypeCount: Object.keys(stateVector).length,
              state_vector: stateVector,
            };
          },
        },

        agentRecordsStatus: {
          async handler() {
            const client = await this.getMongo();
            const db = client.db("keychains");
            const active = await db.collection("active_checkpoints").findOne({ _id: "agent-records" } as any) as any;
            const latest = active
              ? await db.collection("ar_snapshots").findOne({
                  checkpoint_id: active.checkpoint_id,
                  checkpoint_status: "committed",
                })
              : await db.collection("ar_snapshots").findOne(
                  { $or: [{ checkpoint_status: "committed" }, { checkpoint_status: { $exists: false } }] },
                  { sort: { version: -1 } },
                );
            const entryCount = active
              ? await db.collection("checkpoint_entries").countDocuments({ checkpoint_id: active.checkpoint_id })
              : await db.collection("entries").countDocuments();
            return {
              enabled: true,
              latestSnapshot: latest ? latest.version : null,
              latestSnapshotAt: latest ? latest.created_at : null,
              checkpointId: active?.checkpoint_id || null,
              entryCount,
              totalRecordsProjected: latest ? latest.totalRecords : null,
              supersededRecords: latest ? latest.supersededRecords : null,
            };
          },
        },
      },

      async started() {
        this.pool = new Pool(PG_CONFIG);
        this.mongo = new MongoClient(MONGO_URL);
        await this.mongo.connect();
        // Sparse uniqueness applies to the new durable contract field only;
        // historical transition documents remain untouched.
        await this.mongo
          .db("keychains")
          .collection("transitions")
          .createIndex({ keychain_event_id: 1 }, { unique: true, sparse: true });
        await this.mongo
          .db("keychains")
          .collection("ar_snapshots")
          .createIndex({ source_namespace: 1, source_event_id: 1 }, { unique: true, sparse: true });
        await this.mongo
          .db("keychains")
          .collection("checkpoint_entries")
          .createIndex({ checkpoint_id: 1, instance_id: 1 }, { unique: true });
        await this.mongo
          .db("keychains")
          .collection("ar_snapshots")
          .createIndex({ checkpoint_status: 1, version: -1 });

        const sourceNames = (process.env.KEYCHAIN_SOURCE_DATABASES || "nexus,sol")
          .split(",")
          .map((name) => name.trim())
          .filter(Boolean);
        for (const database of sourceNames) {
          const sourcePool = database === PG_CONFIG.database
            ? this.pool
            : new Pool({ ...PG_CONFIG, database });
          this.sourcePools.set(database, sourcePool);
        }
        await this.reconcileCommittedCheckpoints();
        this.outboxTimer = setInterval(
          () => void this.pollOutbox(),
          Number(process.env.KEYCHAIN_OUTBOX_POLL_MS || 5000),
        );
        // Do not delay broker readiness while replaying a backlog. The poller
        // is bounded and will continue draining in the background.
        void this.pollOutbox();

        // D3 (keychains thread e267263c): snapshots are driven by decision
        // points / state transitions (Vision transition() listener, future
        // catalogue), NOT by a timer. The legacy timer produced the 37K
        // decisionless sol_ir.snapshots / keychains.snapshots — removed. The
        // legacy runSnapshot() action remains callable explicitly only.
        this.logger.info(
          "keychain snapshots are event-driven (D3) — no periodic timer; " +
          "runSnapshot() is explicit-invocation only"
        );
      },

      async stopped() {
        if (this.outboxTimer) clearInterval(this.outboxTimer);
        this.outboxTimer = null;
        const pools: Set<Pool> = new Set(this.sourcePools.values());
        if (this.pool) pools.add(this.pool);
        for (const pool of pools) await pool.end();
        this.sourcePools.clear();
        if (this.mongo) await this.mongo.close();
      },
    });
  }

  private async getPool(): Promise<Pool> {
    if (!this.pool) {
      this.pool = new Pool(PG_CONFIG);
      await this.pool.connect();
    }
    return this.pool;
  }

  private async getSourcePool(database: string): Promise<Pool> {
    const existing = this.sourcePools.get(database);
    if (existing) return existing;
    const pool = database === PG_CONFIG.database
      ? await this.getPool()
      : new Pool({ ...PG_CONFIG, database });
    this.sourcePools.set(database, pool);
    return pool;
  }

  private async getMongo(): Promise<MongoClient> {
    if (!this.mongo) {
      this.mongo = new MongoClient(MONGO_URL);
      await this.mongo.connect();
    }
    return this.mongo;
  }

  private parseJsonValue(value: any): any {
    if (typeof value !== "string") return value;
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }

  private outboxToTrigger(row: OutboxRow): TriggerEventContract {
    const sourceEventId = String(row.source_event_id);
    const sourceNamespace = String(row.source_namespace);
    return this.normalizeTriggerEvent({
      schema_version: row.schema_version,
      source_namespace: sourceNamespace,
      source_event_id: sourceEventId,
      event_id: `${sourceNamespace}:${sourceEventId}`,
      kind: row.event_kind,
      outcome: row.outcome,
      aggregate_id: row.aggregate_id,
      actor: row.actor,
      correlation_id: row.correlation_id,
      contract_id: row.contract_id,
      evaluator_id: row.evaluator_id,
      law_id: row.law_id,
      effective_at: row.effective_at,
      recorded_at: row.recorded_at,
      read_set: this.parseJsonValue(row.read_set),
      payload: this.parseJsonValue(row.payload),
      idempotency_key: `${sourceNamespace}:${sourceEventId}`,
    });
  }

  private async claimNextOutboxRow(pool: Pool): Promise<{ client: PoolClient; row: OutboxRow } | null> {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const result = await client.query<OutboxRow>(
        `
        WITH candidate AS (
          SELECT id
          FROM resolution.keychain_event_outbox
          WHERE checkpoint_status IN ('pending', 'failed')
             OR (checkpoint_status = 'delivering'
                 AND claimed_at < now() - interval '5 minutes')
          ORDER BY recorded_at, id
          FOR UPDATE SKIP LOCKED
          LIMIT 1
        )
        UPDATE resolution.keychain_event_outbox e
           SET checkpoint_status = 'delivering',
               claimed_at = now(),
               delivery_attempts = e.delivery_attempts + 1,
               last_error = NULL
          FROM candidate
         WHERE e.id = candidate.id
        RETURNING e.id, e.source_namespace, e.source_event_id, e.event_kind,
                  e.outcome, e.schema_version, e.aggregate_id, e.causation_id,
                  e.correlation_id, e.actor, e.contract_id, e.evaluator_id,
                  e.law_id, e.effective_at, e.recorded_at, e.read_set, e.payload,
                  e.checkpoint_status, e.delivery_attempts
        `,
      );
      if (!result.rows.length) {
        await client.query("ROLLBACK");
        client.release();
        return null;
      }
      await client.query("COMMIT");
      return { client, row: result.rows[0] };
    } catch (err) {
      await client.query("ROLLBACK").catch(() => undefined);
      client.release();
      throw err;
    }
  }

  private async finishOutboxRow(
    client: PoolClient,
    row: OutboxRow,
    status: "delivered" | "not_applicable" | "failed",
    error?: string,
  ): Promise<void> {
    try {
      await client.query(
        `UPDATE resolution.keychain_event_outbox
            SET checkpoint_status = $1,
                claimed_at = NULL,
                delivered_at = CASE WHEN $1 IN ('delivered', 'not_applicable') THEN now() ELSE delivered_at END,
                last_error = $2
          WHERE id = $3
            AND checkpoint_status = 'delivering'
            AND delivery_attempts = $4`,
        [status, error ? error.slice(0, 2000) : null, row.id, row.delivery_attempts],
      );
    } finally {
      client.release();
    }
  }

  private async releaseTriggerReservation(triggerEvent: TriggerEventContract): Promise<void> {
    const client = await this.getMongo();
    await client.db("keychains").collection("transitions").updateOne(
      {
        keychain_event_id: triggerEvent.idempotency_key,
        reservation: true,
      },
      { $unset: { reservation: "", reservation_at: "", checkpoint_id: "" } },
    );
  }

  private async processOutboxRow(pool: Pool, row: OutboxRow, client: PoolClient): Promise<void> {
    const triggerEvent = this.outboxToTrigger(row);
    try {
      const result = await this.runAgentRecordsProjection({ triggerEvent });
      if (result?.checkpoint_pending) {
        await this.finishOutboxRow(client, row, "failed", "checkpoint reservation is still owned by another delivery");
        return;
      }
      await this.finishOutboxRow(client, row, result?.archived ? "not_applicable" : "delivered");
    } catch (err: any) {
      await this.releaseTriggerReservation(triggerEvent).catch((releaseErr) => {
        this.logger.warn("failed to release Keychains trigger reservation", releaseErr);
      });
      await this.finishOutboxRow(client, row, "failed", err?.message || String(err));
      this.logger.error(
        `Keychains outbox delivery failed for ${row.source_namespace}:${row.source_event_id}`,
        err,
      );
    }
  }

  private async pollOutbox(): Promise<void> {
    if (this.outboxPollInFlight) return;
    this.outboxPollInFlight = true;
    try {
      for (const pool of this.sourcePools.values()) {
        // Drain a bounded batch per poll so a large backlog cannot starve
        // Moleculer actions or hold the event loop indefinitely.
        for (let count = 0; count < 10; count += 1) {
          const claim = await this.claimNextOutboxRow(pool);
          if (!claim) break;
          await this.processOutboxRow(pool, claim.row, claim.client);
        }
      }
    } catch (err) {
      this.logger.error("Keychains outbox poll failed", err);
    } finally {
      this.outboxPollInFlight = false;
    }
  }

  private async reconcileCommittedCheckpoints(): Promise<void> {
    const client = await this.getMongo();
    const db = client.db("keychains");
    // A crash can leave a reservation with no delivered snapshot. It is safe
    // to release only old reservations; the source outbox worker will retry.
    const staleBefore = new Date(Date.now() - this.checkpointReservationTtlMs);
    await db.collection("transitions").updateMany(
      { reservation: true, reservation_at: { $lt: staleBefore } },
      { $unset: { reservation: "", reservation_at: "", checkpoint_id: "" } },
    );

    const staleStaged = await db.collection("ar_snapshots").find(
      { checkpoint_status: "staged", created_at: { $lt: staleBefore } },
      { projection: { checkpoint_id: 1 } },
    ).toArray();
    const staleCheckpointIds = staleStaged
      .map((snapshot) => snapshot.checkpoint_id)
      .filter((checkpointId): checkpointId is string => Boolean(checkpointId));
    if (staleCheckpointIds.length > 0) {
      await db.collection("ar_snapshots").deleteMany({ checkpoint_id: { $in: staleCheckpointIds }, checkpoint_status: "staged" });
      await db.collection("checkpoint_entries").deleteMany({ checkpoint_id: { $in: staleCheckpointIds } });
    }

    const latest = await db.collection("ar_snapshots").findOne(
      { $or: [{ checkpoint_status: "committed" }, { checkpoint_status: { $exists: false } }] },
      { sort: { version: -1 } },
    );
    if (latest?.checkpoint_id) {
      await this.promoteActiveCheckpoint(db, latest);
    }
  }

  private async promoteActiveCheckpoint(db: any, checkpoint: any): Promise<void> {
    await db.collection("active_checkpoints").updateOne(
      { _id: "agent-records" },
      {
        $set: {
          checkpoint_id: checkpoint.checkpoint_id,
          version: checkpoint.version,
          source_namespace: checkpoint.source_namespace || null,
          source_event_id: checkpoint.source_event_id || null,
          updated_at: new Date().toISOString(),
        },
      },
      { upsert: true },
    );
  }

  private async runSnapshot(params: { label?: string }): Promise<any> {
    const pool = await this.getPool();
    const client = await this.getMongo();
    const db = client.db("keychains");

    // ── Read canonical state (PG) ────────────────────────────────────────
    const obsRes = await pool.query<Observation>(
      `SELECT id, trigger_type, source_artifact_type, source_artifact_id,
              payload, assessed, created_at
       FROM nebula.observations_history
       ORDER BY created_at`
    );
    const asmRes = await pool.query<Assessment>(
      `SELECT id, observation_id, outcome, confidence, impact_scope,
              open_questions, analysis_detail, created_at
       FROM nebula.assessments_history
       ORDER BY created_at`
    );
    const observations = obsRes.rows;
    const assessments = asmRes.rows;

    // ── Read previous snapshot (Mongo) for drift computation ─────────────
    const snapshots = db.collection("snapshots");
    const prev = await snapshots.findOne({}, { sort: { version: -1 } });
    const prevVersion = prev ? (prev.version as number) : 0;
    const prevObs = prev ? ((prev.observations || []) as string[]) : [];
    const prevAssessed = prev ? ((prev.assessed || {}) as Record<string, string>) : {};
    const prevOutcomes = prev ? ((prev.outcomes || {}) as Record<string, string>) : {};

    // ── Project into Mongo (replace-per-snapshot, idempotent) ────────────
    const version = prevVersion + 1;
    const label = params.label || `snapshot-v${version}`;
    const now = new Date().toISOString();

    await db.collection("observations").deleteMany({});
    await db.collection("assessments").deleteMany({});
    if (observations.length) {
      await db.collection("observations").insertMany(
        observations.map((o) => ({ ...o, snapshot_version: version, projected_at: now }))
      );
    }
    if (assessments.length) {
      await db.collection("assessments").insertMany(
        assessments.map((a) => ({ ...a, snapshot_version: version, projected_at: now }))
      );
    }

    // ── Drift re-evaluation vs previous observation set ──────────────────
    const driftFindings: any[] = [];
    const currentIds = new Set(observations.map((o) => o.id));
    const currentAssessed: Record<string, string> = {};
    const currentOutcomes: Record<string, string> = {};

    for (const o of observations) {
      if (o.assessed) currentAssessed[o.id] = "assessed";
    }
    for (const a of assessments) {
      if (!currentOutcomes[a.observation_id]) currentOutcomes[a.observation_id] = a.outcome;
    }

    for (const o of observations) {
      // New observation since previous snapshot
      if (!prevObs.includes(o.id)) {
        driftFindings.push({
          snapshot_version: version,
          kind: "new_observation",
          observation_id: o.id,
          trigger_type: o.trigger_type,
          description: `Observation ${o.id} (${o.trigger_type}) appeared since snapshot v${prevVersion}`,
          severity: "info",
          detected_at: now,
        });
      }
      // Newly assessed
      if (o.assessed && !prevAssessed[o.id]) {
        driftFindings.push({
          snapshot_version: version,
          kind: "newly_assessed",
          observation_id: o.id,
          outcome: currentOutcomes[o.id] || null,
          description: `Observation ${o.id} newly assessed (outcome=${currentOutcomes[o.id] || "?"})`,
          severity: "info",
          detected_at: now,
        });
      }
    }
    // Outcome changes on previously-assessed observations
    for (const obsId of Object.keys(prevOutcomes)) {
      const prevOutcome = prevOutcomes[obsId];
      const curOutcome = currentOutcomes[obsId];
      if (curOutcome && curOutcome !== prevOutcome) {
        driftFindings.push({
          snapshot_version: version,
          kind: "outcome_change",
          observation_id: obsId,
          from: prevOutcome,
          to: curOutcome,
          description: `Assessment outcome for ${obsId} changed ${prevOutcome} -> ${curOutcome}`,
          severity: "warning",
          detected_at: now,
        });
      }
    }

    if (driftFindings.length) {
      await db.collection("drift_findings").insertMany(driftFindings);
    }

    // ── Record the snapshot ──────────────────────────────────────────────
    await snapshots.insertOne({
      version,
      label,
      created_at: now,
      observationCount: observations.length,
      assessmentCount: assessments.length,
      driftCount: driftFindings.length,
      observations: observations.map((o) => o.id),
      assessed: currentAssessed,
      outcomes: currentOutcomes,
      prevVersion,
    });

    return {
      ok: true,
      version,
      label,
      observations: observations.length,
      assessments: assessments.length,
      driftFindings: driftFindings.length,
      prevVersion,
    };
  }

  // ========================================================================
  // Agent Records Keychain Projection
  // ========================================================================

  /**
   * Extract a supersession pointer from a record's tags.
   *
   * Tag patterns (case-insensitive):
   *   supersedes:<id-prefix>         — this record supersedes <id-prefix>
   *   supersedes-partially:<id>      — partial supersession
   *   superseded-by:<id-prefix>      — this record is superseded by <id-prefix>
   *
   * Returns { pointsTo, direction } where pointsTo is the referenced id prefix,
   * or null if no supersession tag is present.
   */
  private extractSupersessionTag(tags: string[]): { pointsTo: string; direction: "forward" | "backward" } | null {
    for (const tag of tags) {
      const lower = tag.toLowerCase();
      // forward: this record supersedes an earlier one
      const fwdMatch = lower.match(/^supersedes(?::|-(?:partially|incident|c5)[^:]*)?:([0-9a-f]{8,})/i);
      if (fwdMatch) {
        return { pointsTo: fwdMatch[1], direction: "forward" };
      }
      // backward: this record is superseded by a later one
      const bwdMatch = lower.match(/^superseded-by:([0-9a-f]{8,})/i);
      if (bwdMatch) {
        return { pointsTo: bwdMatch[1], direction: "backward" };
      }
    }
    return null;
  }

  /**
   * Extract an amendment chain token from the title.
   *
   * Amendment titles follow the pattern:
   *   "<context> <token> — amendment v<N>: <detail>"
   * e.g. "W1.10 decision 05d0fe54 — amendment v4: ..."
   *
   * The token (e.g. "05d0fe54") is the logical instance identity.
   * Returns the token if this is an amendment, or null.
   */
  private extractAmendmentToken(title: string): string | null {
    // Match a hex token (6+ chars) that appears before "amendment v<N>"
    const match = title.match(/([0-9a-f]{6,})\s*[—–-]\s*amendment\s+v(\d+)/i);
    if (match) {
      return match[1];
    }
    return null;
  }

  /**
   * Extract the amendment version number from the title.
   * Returns the version (e.g. 4 for "amendment v4"), or 0 if not an amendment.
   */
  private extractAmendmentVersion(title: string): number {
    const match = title.match(/amendment\s+v(\d+)/i);
    return match ? parseInt(match[1], 10) : 0;
  }

  /**
   * Resolve logical record instances from agent records.
   *
   * Groups records by logical instance identity, then picks the latest
   * issuance per instance. Two grouping mechanisms:
   *
   * 1. Amendment chains: records sharing the same hex token extracted
   *    from the title (e.g. "05d0fe54"). The latest amendment is current.
   *
   * 2. Explicit supersession tags: "supersedes:<id-prefix>" links a newer
   *    record to an older one. We walk the chain forward to find the tip.
   *
   * 3. Records with no supersession linkage are single-issuance instances.
   *
   * Returns a map of instance_id → KeychainEntry.
   */
  private resolveKeychainEntries(
    records: AgentRecord[],
    version: number,
    now: string,
    assetsByRecordId?: Map<string, AssetRef>
  ): Map<string, KeychainEntry> {
    const byId = new Map<string, AgentRecord>();
    const byIdPrefix = new Map<string, AgentRecord>(); // prefix → record (first 8+ chars of UUID)

    for (const r of records) {
      byId.set(r.id, r);
      // Index by first 8 chars of UUID for prefix-based lookup
      const prefix = r.id.replace(/-/g, "").substring(0, 8);
      if (!byIdPrefix.has(prefix)) {
        byIdPrefix.set(prefix, r);
      }
      // Also try the full UUID without dashes
      byIdPrefix.set(r.id, r);
    }

    // Group 1: amendment chains (by token extracted from title)
    const amendmentGroups = new Map<string, AgentRecord[]>(); // token → records sorted by created_at
    const amendmentRecordIds = new Set<string>();

    for (const r of records) {
      const token = this.extractAmendmentToken(r.title);
      if (token) {
        if (!amendmentGroups.has(token)) {
          amendmentGroups.set(token, []);
        }
        amendmentGroups.get(token)!.push(r);
        amendmentRecordIds.add(r.id);
      }
    }

    // Group 2: explicit supersession chains (tag-based)
    // Build a forward chain: record → record it supersedes
    // Then find chain tips (records not superseded by anyone else)
    const supersedesMap = new Map<string, string>(); // newerId → olderId (it supersedes)
    const supersededByMap = new Map<string, string>(); // olderId → newerId (it is superseded by)
    const explicitSupersessionIds = new Set<string>();

    for (const r of records) {
      const ss = this.extractSupersessionTag(r.tags || []);
      if (ss && ss.direction === "forward") {
        // This record supersedes the one identified by the prefix
        const olderPrefix = ss.pointsTo;
        const olderRecord = byIdPrefix.get(olderPrefix);
        if (olderRecord) {
          supersedesMap.set(r.id, olderRecord.id);
          supersededByMap.set(olderRecord.id, r.id);
          explicitSupersessionIds.add(r.id);
          explicitSupersessionIds.add(olderRecord.id);
        }
      }
    }

    // For explicit supersession: find chain tips.
    // A tip is a record that supersedes others (key in supersedesMap) but
    // is not itself superseded by anyone (NOT a key in supersededByMap).
    // Only tips should start chain-walking — non-tips are chain members
    // that will be reached by walking backward from their tip.
    const explicitChains = new Map<string, string[]>(); // tipId → [chain of ids from oldest to newest]
    const processedExplicit = new Set<string>();

    for (const r of records) {
      if (!explicitSupersessionIds.has(r.id) || processedExplicit.has(r.id)) continue;

      // A tip: supersedes someone AND is not itself superseded
      const isTip = supersedesMap.has(r.id) && !supersededByMap.has(r.id);
      if (!isTip) {
        // Not a tip — skip; will be reached when its tip walks backward.
        // Do NOT add to processedExplicit — that would prevent the
        // backward walk from including this record in the chain.
        continue;
      }

      // Walk backward from this tip to find the oldest in the chain
      const chain: string[] = [];
      let current: string | undefined = r.id;

      while (current && !processedExplicit.has(current)) {
        chain.unshift(current);
        processedExplicit.add(current);
        current = supersedesMap.get(current);
      }

      if (chain.length > 0) {
        explicitChains.set(r.id, chain);
      }
    }

    // Any remaining unprocessed explicit records are orphans (their link
    // target was not found) — treat them as single-issuance below.

    // Build entries
    const entries = new Map<string, KeychainEntry>();

    // Entry 1: Amendment chains
    for (const [token, chainRecords] of amendmentGroups) {
      // Sort by created_at ascending (oldest first)
      chainRecords.sort((a, b) => a.created_at.getTime() - b.created_at.getTime());
      const latest = chainRecords[chainRecords.length - 1];
      const chainIds = chainRecords.map((r) => r.id);
      const prevId = chainRecords.length > 1 ? chainRecords[chainRecords.length - 2].id : null;

      entries.set(`amendment:${token}`, {
        instance_id: token,
        record_type: latest.record_type,
        role: latest.role,
        asset_id: assetsByRecordId?.get(latest.id)?.canonical_asset_id ?? null,
        asset_kind: assetsByRecordId?.get(latest.id)?.asset_kind ?? null,
        current: {
          record_id: latest.id,
          version: this.extractAmendmentVersion(latest.title) || chainRecords.length,
          title: latest.title,
          content: latest.content,
          tags: latest.tags || [],
          level: latest.level,
          visibility_scope: latest.visibility_scope,
          model: latest.model,
          created_at: latest.created_at.toISOString(),
        },
        provenance: {
          issued_by: latest.role,
          issued_at: latest.created_at.toISOString(),
          supersedes: prevId,
          supersession_type: "amendment",
          chain_length: chainRecords.length,
          chain_ids: chainIds,
        },
        snapshot_version: version,
        projected_at: now,
      });
    }

    // Entry 2: Explicit supersession chains (tag-based, not already in amendment groups)
    for (const [tipId, chainIds] of explicitChains) {
      // Skip if any member is already in an amendment group
      if (chainIds.some((id) => amendmentRecordIds.has(id))) continue;

      const latest = byId.get(tipId)!;
      const oldest = byId.get(chainIds[0])!;
      // Use the oldest record's id prefix as the instance identity
      const instanceKey = oldest.id.substring(0, 8);

      // For explicit chains, the chain_ids are from oldest to newest
      // The latest is the tip (last in the array after walking backward... actually
      // we unshifted so chain[0] is the oldest we walked back to, and the tip is
      // the record we started from. Let me re-check: we started from r, walked
      // backward via unshift, so chain[0] = oldest, chain[chain.length-1] = r (the tip)
      const latestRecord = byId.get(chainIds[chainIds.length - 1])!;
      const prevRecord = chainIds.length > 1 ? byId.get(chainIds[chainIds.length - 2])! : null;

      entries.set(`explicit:${instanceKey}`, {
        instance_id: instanceKey,
        record_type: latestRecord.record_type,
        role: latestRecord.role,
        asset_id: assetsByRecordId?.get(latestRecord.id)?.canonical_asset_id ?? null,
        asset_kind: assetsByRecordId?.get(latestRecord.id)?.asset_kind ?? null,
        current: {
          record_id: latestRecord.id,
          version: chainIds.length,
          title: latestRecord.title,
          content: latestRecord.content,
          tags: latestRecord.tags || [],
          level: latestRecord.level,
          visibility_scope: latestRecord.visibility_scope,
          model: latestRecord.model,
          created_at: latestRecord.created_at.toISOString(),
        },
        provenance: {
          issued_by: latestRecord.role,
          issued_at: latestRecord.created_at.toISOString(),
          supersedes: prevRecord ? prevRecord.id : null,
          supersession_type: "explicit",
          chain_length: chainIds.length,
          chain_ids: chainIds,
        },
        snapshot_version: version,
        projected_at: now,
      });
    }

    // Entry 3: Single-issuance records (no supersession linkage)
    for (const r of records) {
      // Skip records already in amendment or explicit chains
      if (amendmentRecordIds.has(r.id)) continue;
      if (explicitSupersessionIds.has(r.id)) continue;

      entries.set(`single:${r.id}`, {
        instance_id: r.id,
        record_type: r.record_type,
        role: r.role,
        asset_id: assetsByRecordId?.get(r.id)?.canonical_asset_id ?? null,
        asset_kind: assetsByRecordId?.get(r.id)?.asset_kind ?? null,
        current: {
          record_id: r.id,
          version: 1,
          title: r.title,
          content: r.content,
          tags: r.tags || [],
          level: r.level,
          visibility_scope: r.visibility_scope,
          model: r.model,
          created_at: r.created_at.toISOString(),
        },
        provenance: {
          issued_by: r.role,
          issued_at: r.created_at.toISOString(),
          supersedes: null,
          supersession_type: "none",
          chain_length: 1,
          chain_ids: [r.id],
        },
        snapshot_version: version,
        projected_at: now,
      });
    }

    return entries;
  }

  /**
   * Project agent_records into the keychain contextual layer.
   *
   * Reads all agent_records from PG, resolves supersession chains,
   * and writes one keychain entry per logical instance (latest issuance only)
   * into the `entries` Mongo collection. Previous snapshot's entries are
   * replaced (idempotent). Snapshot metadata is recorded in `ar_snapshots`.
   */
  private async runAgentRecordsProjection(params: {
    label?: string;
    trigger?: string;
    triggerEvent?: TriggerEventContract;
  }): Promise<any> {
    let release!: () => void;
    const previous = this.agentProjectionLock;
    this.agentProjectionLock = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    try {
      return await this.projectAgentRecords(params);
    } finally {
      release();
    }
  }

  private async projectAgentRecords(params: {
    label?: string;
    trigger?: string;
    triggerEvent?: TriggerEventContract;
  }): Promise<any> {
    const pool = await this.getPool();
    const client = await this.getMongo();
    const db = client.db("keychains");

    // ── Normalize the trigger event (shared contract, catalogue 332d6831) ─
    // Structured triggerEvent OR backward-compatible legacy trigger string.
    // New events are idempotent on source_namespace:source_event_id.
    const triggerEvent: TriggerEventContract | null = params.triggerEvent
      ? this.normalizeTriggerEvent(params.triggerEvent)
      : params.trigger
        ? this.parseLegacyTrigger(params.trigger)
        : null;

    if (triggerEvent) {
      triggerEvent.recorded_at = triggerEvent.recorded_at || new Date().toISOString();
      const existing = await db.collection("transitions").findOne({
        $or: [
          { keychain_event_id: triggerEvent.idempotency_key },
          { idempotency_key: triggerEvent.idempotency_key },
        ],
      });
      if (existing && existing.snapshot_version) {
        return {
          ok: true,
          deduplicated: true,
          version: existing.snapshot_version,
          trigger: triggerEvent,
          note: "snapshot already exists for this trigger event",
        };
      }

      // A process can fail after the checkpoint is committed but before the
      // transition document is finalized. Source identity is the durable
      // recovery key, so repair the transition and do not create a second
      // checkpoint on retry.
      if (triggerEvent.source_namespace && triggerEvent.source_event_id) {
        const committed = await db.collection("ar_snapshots").findOne({
          checkpoint_status: "committed",
          source_namespace: triggerEvent.source_namespace,
          source_event_id: triggerEvent.source_event_id,
        });
        if (committed) {
          await this.promoteActiveCheckpoint(db, committed);
          await db.collection("transitions").updateOne(
            { keychain_event_id: triggerEvent.idempotency_key },
            {
              $set: {
                ...triggerEvent,
                keychain_event_id: triggerEvent.idempotency_key,
                snapshot_version: committed.version,
                checkpoint_id: committed.checkpoint_id,
                checkpoint_status: "delivered",
                delivered_at: committed.committed_at || committed.created_at,
                created_at: triggerEvent.recorded_at,
              },
              $unset: { reservation: "", reservation_at: "" },
            },
            { upsert: true },
          );
          return {
            ok: true,
            deduplicated: true,
            version: committed.version,
            trigger: triggerEvent,
            note: "recovered an already committed checkpoint for this source event",
          };
        }
      }

      // Refused/rejected/unknown outcomes are durable evidence, but do not
      // fabricate a global state-vector checkpoint.
      if (triggerEvent.outcome && triggerEvent.outcome !== "committed") {
        await db.collection("transitions").updateOne(
          { keychain_event_id: triggerEvent.idempotency_key },
          {
            $setOnInsert: {
              ...triggerEvent,
              keychain_event_id: triggerEvent.idempotency_key,
              created_at: triggerEvent.recorded_at,
              snapshot_version: null,
              checkpoint_status: "not_applicable",
            },
          },
          { upsert: true },
        );
        return {
          ok: true,
          archived: true,
          checkpoint_created: false,
          trigger: triggerEvent,
          note: "negative outcome archived without a state-vector checkpoint",
        };
      }

      // Reserve the event before building the projection. The sparse unique
      // index makes concurrent deliveries converge on one reservation.
      try {
        await db.collection("transitions").insertOne({
          ...triggerEvent,
          keychain_event_id: triggerEvent.idempotency_key,
          created_at: triggerEvent.recorded_at,
          reservation: true,
          reservation_at: new Date(),
        });
      } catch (err: any) {
        if (err?.code !== 11000) throw err;
        const reserved = await db.collection("transitions").findOne({
          keychain_event_id: triggerEvent.idempotency_key,
        });
        if (reserved?.snapshot_version) {
          return {
            ok: true,
            deduplicated: true,
            version: reserved.snapshot_version,
            trigger: triggerEvent,
          };
        }
        return {
          ok: false,
          deduplicated: true,
          checkpoint_pending: true,
          trigger: triggerEvent,
          note: "another delivery owns checkpoint construction",
        };
      }
    }

    // ── Read all agent records from PG ───────────────────────────────────
    const res = await pool.query<AgentRecord>(
      `SELECT id, record_type, role, title, content, source_path,
              metadata, tags, system_id, subsystem_id, feature_id,
              plan_ref, candidate_id, requirement_id,
              created_at, level, visibility_scope, model
       FROM nebula.agent_records
       ORDER BY created_at`
    );
    const records = res.rows;

    // ── Read canonical assets (semantics.canonical_asset, DBA backfill) ───
    // Map record_id -> { canonical_asset_id, asset_kind } so each keychain
    // instance carries the asset of its current record (instance-level).
    const assetsByRecordId = new Map<string, AssetRef>();
    try {
      const assetRes = await pool.query(
        `SELECT canonical_asset_id, asset_kind
         FROM semantics.canonical_asset
         WHERE expired_at IS NULL
           AND canonical_asset_id LIKE 'asset:nexus:nebula_agent_records:%'`
      );
      for (const row of assetRes.rows) {
        const recordId = String(row.canonical_asset_id)
          .split(":nebula_agent_records:")
          .pop();
        if (recordId) {
          assetsByRecordId.set(recordId, {
            canonical_asset_id: String(row.canonical_asset_id),
            asset_kind: String(row.asset_kind || ""),
          });
        }
      }
    } catch (err) {
      this.logger.warn("asset lookup failed; entries will carry null asset_id", err);
    }

    // ── Read previous snapshot version ────────────────────────────────────
    const arSnapshots = db.collection("ar_snapshots");
    const prev = await arSnapshots.findOne(
      { $or: [{ checkpoint_status: "committed" }, { checkpoint_status: { $exists: false } }] },
      { sort: { version: -1 } },
    );
    const prevVersion = prev ? (prev.version as number) : 0;
    const prevInstanceIds = prev
      ? new Set<string>((prev.instance_ids as string[]) || [])
      : new Set<string>();
    const prevCurrentRecordIds = prev
      ? new Set<string>((prev.current_record_ids as string[]) || [])
      : new Set<string>();

    // ── Resolve logical instances ─────────────────────────────────────────
    const version = prevVersion + 1;
    const label = params.label || `ar-snapshot-v${version}`;
    const now = new Date().toISOString();

    const entries = this.resolveKeychainEntries(records, version, now, assetsByRecordId);

    // ── Compute drift: new/changed instances vs previous snapshot ─────────
    const driftFindings: any[] = [];
    const currentInstanceIds = new Set(entries.keys());
    const currentRecordIds = new Set<string>();

    for (const entry of entries.values()) {
      currentRecordIds.add(entry.current.record_id);
    }

    // New instances (appeared since last snapshot)
    for (const instanceId of currentInstanceIds) {
      if (!prevInstanceIds.has(instanceId)) {
        const entry = entries.get(instanceId)!;
        driftFindings.push({
          snapshot_version: version,
          kind: "new_instance",
          instance_id: instanceId,
          record_type: entry.record_type,
          role: entry.role,
          description: `New keychain instance ${instanceId} (${entry.record_type}/${entry.role})`,
          severity: "info",
          detected_at: now,
        });
      }
    }

    // Superseded instances (current record changed since last snapshot)
    for (const [instanceId, entry] of entries) {
      if (prevInstanceIds.has(instanceId) && !prevCurrentRecordIds.has(entry.current.record_id)) {
        driftFindings.push({
          snapshot_version: version,
          kind: "superseded",
          instance_id: instanceId,
          record_type: entry.record_type,
          role: entry.role,
          new_record_id: entry.current.record_id,
          new_version: entry.current.version,
          description: `Instance ${instanceId} superseded: now v${entry.current.version} (${entry.current.record_id})`,
          severity: "info",
          detected_at: now,
        });
      }
    }

    // ── Stage the checkpoint before changing the active pointer ───────────
    // Mongo transactions are not assumed here because the deployed Mongo
    // topology may be standalone. The staged -> committed -> active protocol
    // makes the previous checkpoint remain readable until promotion, and
    // startup reconciliation can repair a crash between any two markers.
    const checkpointId = randomUUID();
    const checkpointEntries = Array.from(entries.values()).map((entry) => ({
      ...entry,
      checkpoint_id: checkpointId,
    }));
    if (checkpointEntries.length > 0) {
      await db.collection("checkpoint_entries").insertMany(checkpointEntries);
    }

    const supersededCount = records.length - entries.size;
    const typeBreakdown: Record<string, number> = {};
    const roleBreakdown: Record<string, number> = {};

    // D1 (Option B): the state vector = the CURRENT set of records for every
    // record type — a compact per-type manifest of active instances, NOT a
    // content clone. If the same logical instance carries multiple record
    // types (unusual), we list it under each type it currently represents.
    // record_type -> list of active instances ({instance_id, record_id,
    // version, role, supersession_type}) for that type.
    const stateVector: Record<string, any[]> = {};

    for (const entry of entries.values()) {
      typeBreakdown[entry.record_type] = (typeBreakdown[entry.record_type] || 0) + 1;
      roleBreakdown[entry.role] = (roleBreakdown[entry.role] || 0) + 1;

      (stateVector[entry.record_type] ||= []).push({
        instance_id: entry.instance_id,
        record_id: entry.current.record_id,
        version: entry.current.version,
        role: entry.role,
        supersession_type: entry.provenance.supersession_type,
        asset_id: entry.asset_id, // cross-store lineage: keychains instance -> asset -> shrapnel
      });
    }

    const checkpoint = {
      checkpoint_id: checkpointId,
      version,
      label,
      created_at: now,
      totalRecords: records.length,
      entryCount: entries.size,
      supersededRecords: supersededCount,
      driftCount: driftFindings.length,
      instance_ids: Array.from(currentInstanceIds),
      current_record_ids: Array.from(currentRecordIds),
      typeBreakdown,
      roleBreakdown,
      state_vector: stateVector, // D1: current set of records per record type
      ...(triggerEvent?.source_namespace && triggerEvent?.source_event_id
        ? {
            source_namespace: triggerEvent.source_namespace,
            source_event_id: triggerEvent.source_event_id,
          }
        : {}),
      trigger: params.trigger || null,
      trigger_event: triggerEvent || null, // normalized contract + idempotency key
      checkpoint_status: "staged",
      prevVersion,
    };
    await arSnapshots.insertOne(checkpoint);

    // The staged checkpoint is complete before it becomes visible as current.
    await arSnapshots.updateOne(
      { checkpoint_id: checkpointId, checkpoint_status: "staged" },
      { $set: { checkpoint_status: "committed", committed_at: new Date().toISOString() } },
    );
    await this.promoteActiveCheckpoint(db, checkpoint);

    if (driftFindings.length > 0) {
      await db.collection("ar_drift_findings").insertMany(
        driftFindings.map((finding) => ({ ...finding, checkpoint_id: checkpointId })),
      );
    }

    // Compatibility projections are refreshed only after checkpoint promotion.
    // Consumers of the hardened path use checkpoint_entries + active_checkpoints.
    await db.collection("entries").deleteMany({});
    if (checkpointEntries.length > 0) {
      await db.collection("entries").insertMany(checkpointEntries);
    }

    // ── Record the trigger event with the produced snapshot version ───────
    // (after the snapshot insert, so dedup can key on snapshot_version)
    if (triggerEvent) {
      await db.collection("transitions").updateOne(
        { keychain_event_id: triggerEvent.idempotency_key },
        {
          $set: {
            ...triggerEvent,
            idempotency_key: triggerEvent.idempotency_key,
            snapshot_version: version,
            checkpoint_id: checkpointId,
            checkpoint_status: "delivered",
            delivered_at: now,
            created_at: now,
          },
          $unset: { reservation: "", reservation_at: "" },
        },
      );
    }

    // D5: record_type_state — the per-turn "what we believe right now"
    // surface. One doc per record type with the active instance.
    const rtsDocs = Object.entries(stateVector).map(([record_type, instances]) => ({
      record_type,
      active_instances: instances,
      instance_count: instances.length,
      updated_at: now,
      snapshot_version: version,
      checkpoint_id: checkpointId,
    }));
    await db.collection("record_type_state").deleteMany({});
    if (rtsDocs.length > 0) {
      await db.collection("record_type_state").insertMany(rtsDocs);
    }

    return {
      ok: true,
      version,
      label,
      totalRecords: records.length,
      entries: entries.size,
      supersededRecords: supersededCount,
      driftFindings: driftFindings.length,
      typeBreakdown,
      roleBreakdown,
      recordTypeCount: Object.keys(stateVector).length,
      trigger: triggerEvent || null,
      deduplicated: false,
      prevVersion,
    };
  }

  /**
   * Backward-compatible parse of the legacy trigger string form:
   *   "sol-transition:<transitionId>:<entityId>"
   * Returns a normalized TriggerEventContract.
   */
  private normalizeTriggerEvent(event: TriggerEventContract): TriggerEventContract {
    const sourceNamespace = event.source_namespace || event.source || "unknown";
    const sourceEventId = event.source_event_id || event.id || null;
    const key = event.idempotency_key || `${sourceNamespace}:${sourceEventId || ""}`;
    return {
      ...event,
      schema_version: event.schema_version || 1,
      source_namespace: sourceNamespace,
      source_event_id: sourceEventId,
      event_id: event.event_id || key,
      id: sourceEventId,
      idempotency_key: key,
      outcome: event.outcome || "committed",
    };
  }

  private parseLegacyTrigger(trigger: string): TriggerEventContract {
    if (trigger.startsWith("sol-transition:")) {
      const rest = trigger.slice("sol-transition:".length);
      const colon = rest.indexOf(":");
      const transitionId = colon >= 0 ? rest.slice(0, colon) : rest;
      const entityId = colon >= 0 ? rest.slice(colon + 1) : null;
      return {
        kind: "resolution.transition.committed",
        id: transitionId || null,
        source_namespace: "sol-api",
        source_event_id: `${transitionId || ""}:${entityId || ""}`,
        source: "sol-api",
        outcome: "committed",
        meta: { entity_id: entityId || null },
        idempotency_key: `sol-api:${transitionId || ""}:${entityId || ""}`,
      };
    }
    return this.normalizeTriggerEvent({
      kind: "unknown",
      id: null,
      raw: trigger,
      outcome: "committed",
      idempotency_key: `legacy:${trigger}`,
    });
  }
}
