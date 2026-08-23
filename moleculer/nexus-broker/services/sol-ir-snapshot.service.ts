import "dotenv/config";
import { Service, ServiceBroker, Context } from "moleculer";
import { Pool } from "pg";
import { MongoClient } from "mongodb";

/**
 * SOL IR SNAPSHOT service (renamed per D-2026-08-23-B W0.4).
 *
 * Formerly solir.service.ts. This is a one-way Mongo PROJECTION consumer —
 * nothing named sol-ir here is operational authority; the canonical SOL IR
 * substrate is the resolution schema (see authority-matrix.json domain sol_ir).
 *
 * Periodically snapshots the canonical resolution state (PostgreSQL:
 * nebula.observations_history / nebula.assessments_history — per
 * D-2026-08-14-003 PostgreSQL stays canonical) into the MongoDB SOL IR
 * projection store (`sol_ir`), then re-evaluates the previous observation
 * set to emit drift findings.
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

const PG_CONFIG = {
  host: process.env.PG_HOST || "localhost",
  port: Number(process.env.PG_PORT || 5432),
  user: process.env.PG_USER || "pguser",
  password: process.env.PG_PASSWORD || "pgpass",
  database: process.env.PG_DB_NAME || "nexus",
};

const MONGO_URL = process.env.MONGO_URL || "mongodb://localhost:27017";

export default class SolIrService extends Service {
  private pool: Pool | null = null;
  private mongo: MongoClient | null = null;
  private timer: NodeJS.Timeout | null = null;

  constructor(broker: ServiceBroker) {
    super(broker);

    this.parseServiceSchema({
      name: "sol-ir-snapshot",

      actions: {
        snapshot: {
          async handler(ctx: Context) {
            return this.runSnapshot(ctx.params as any);
          },
        },

        status: {
          async handler() {
            const client = await this.getMongo();
            const db = client.db("sol_ir");
            const latest = await db.collection("snapshots").findOne({}, { sort: { version: -1 } });
            return {
              enabled: true,
              intervalMs: Number(process.env.SOLIR_SYNC_INTERVAL_MS || 60000),
              latestSnapshot: latest ? latest.version : null,
              latestSnapshotAt: latest ? latest.created_at : null,
            };
          },
        },
      },

      async started() {
        this.pool = new Pool(PG_CONFIG);
        this.mongo = new MongoClient(MONGO_URL);
        await this.mongo.connect();

        const intervalMs = Number(process.env.SOLIR_SYNC_INTERVAL_MS || 60000);
        this.logger.info(`solir sync every ${intervalMs}ms`);
        this.timer = setInterval(() => {
          this.runSnapshot({}).catch((err: Error) => this.logger.error("solir periodic sync failed", err));
        }, intervalMs);
      },

      async stopped() {
        if (this.timer) clearInterval(this.timer);
        if (this.pool) await this.pool.end();
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

  private async getMongo(): Promise<MongoClient> {
    if (!this.mongo) {
      this.mongo = new MongoClient(MONGO_URL);
      await this.mongo.connect();
    }
    return this.mongo;
  }

  private async runSnapshot(params: { label?: string }): Promise<any> {
    const pool = await this.getPool();
    const client = await this.getMongo();
    const db = client.db("sol_ir");

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
}
