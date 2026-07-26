import { Router, Request, Response } from "express";
import { query } from "../db/client.js";

const router = Router();

// ── servers (hosts) ────────────────────────────────────────────────

// GET /terrain/servers
router.get("/servers", async (_req: Request, res: Response) => {
  try {
    const rows = await query(
      `SELECT id, hostname, ip_address, os, status, startup, notes, is_internal, active_flag
       FROM servers ORDER BY hostname`
    );
    res.json({ servers: rows, count: rows.length });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to list servers", message: err?.message ?? String(err) });
  }
});

// ── mcp_servers ────────────────────────────────────────────────────

// GET /terrain/mcp-servers
router.get("/mcp-servers", async (_req: Request, res: Response) => {
  try {
    const rows = await query(
      `SELECT id, name, port, workspace_path, health_check_url, status, transport_type, version, description, startup, health, is_internal
       FROM mcp_servers ORDER BY name`
    );
    res.json({ mcpServers: rows, count: rows.length });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to list MCP servers", message: err?.message ?? String(err) });
  }
});

// POST /terrain/mcp-servers
router.post("/mcp-servers", async (req: Request, res: Response) => {
  try {
    const args = req.body ?? {};
    const existing = await query(`SELECT id FROM mcp_servers WHERE name = $1`, [args.name]);
    let row: any;
    if (existing.length > 0) {
      const id = existing[0].id;
      const sets: string[] = []; const vals: any[] = []; let i = 1;
      const fields = ["port", "workspace_path", "health_check_url", "status", "transport_type", "version", "description", "startup", "health"];
      for (const f of fields) {
        if (args[f] !== undefined) { sets.push(`${f} = $${i++}`); vals.push(args[f]); }
      }
      if (sets.length > 0) {
        vals.push(id);
        const result = await query(`UPDATE mcp_servers SET ${sets.join(", ")} WHERE id = $${i} RETURNING *`, vals);
        row = result[0];
      } else {
        row = existing[0];
      }
    } else {
      const cols = ["name", "service_type_id"];
      const placeholders = ["$1", "$2"];
      const vals: any[] = [args.name, 1]; // 1 = MCP service type
      let i = 3;
      const fields = ["port", "workspace_path", "health_check_url", "status", "transport_type", "version", "description", "startup", "health"];
      for (const f of fields) {
        if (args[f] !== undefined) { cols.push(f); placeholders.push(`$${i++}`); vals.push(args[f]); }
      }
      const result = await query(
        `INSERT INTO mcp_servers (${cols.join(", ")}) VALUES (${placeholders.join(", ")}) RETURNING *`,
        vals
      );
      row = result[0];
    }
    res.json({ registered: row, action: existing.length > 0 ? "updated" : "created" });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to register MCP server", message: err?.message ?? String(err) });
  }
});

// ── runnable_services ──────────────────────────────────────────────

// GET /terrain/runnable-services
router.get("/runnable-services", async (_req: Request, res: Response) => {
  try {
    const rows = await query(
      `SELECT rs.id, rs.name, rs.port, rs.workspace_path, rs.health_check_url, rs.status,
              rs.version, rs.description, rs.repository_url, rs.startup, rs.health, rs.is_internal,
              st.name AS service_type
       FROM runnable_services rs
       LEFT JOIN service_types st ON st.id = rs.service_type_id
       ORDER BY rs.name`
    );
    res.json({ services: rows, count: rows.length });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to list runnable services", message: err?.message ?? String(err) });
  }
});

// POST /terrain/runnable-services
router.post("/runnable-services", async (req: Request, res: Response) => {
  try {
    const args = req.body ?? {};
    const existing = await query(`SELECT id FROM runnable_services WHERE name = $1`, [args.name]);
    let row: any;
    if (existing.length > 0) {
      const id = existing[0].id;
      const sets: string[] = []; const vals: any[] = []; let i = 1;
      const fields = ["port", "workspace_path", "health_check_url", "status", "version", "description", "startup", "health", "service_type_id"];
      for (const f of fields) {
        if (args[f] !== undefined) { sets.push(`${f} = $${i++}`); vals.push(args[f]); }
      }
      const dirty = sets.length > 0;
      if (dirty) {
        vals.push(id);
        const result = await query(`UPDATE runnable_services SET ${sets.join(", ")} WHERE id = $${i} RETURNING *`, vals);
        row = result[0];
      } else {
        row = existing[0];
      }
    } else {
      const serviceTypeId = args.service_type_id ?? 3; // default: Express
      const cols = ["name", "service_type_id"];
      const placeholders = ["$1", "$2"];
      const vals: any[] = [args.name, serviceTypeId];
      let i = 3;
      const fields = ["port", "workspace_path", "health_check_url", "status", "version", "description", "startup", "health"];
      for (const f of fields) {
        if (args[f] !== undefined) { cols.push(f); placeholders.push(`$${i++}`); vals.push(args[f]); }
      }
      const result = await query(
        `INSERT INTO runnable_services (${cols.join(", ")}) VALUES (${placeholders.join(", ")}) RETURNING *`,
        vals
      );
      row = result[0];
    }
    res.json({ registered: row, action: existing.length > 0 ? "updated" : "created" });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to register runnable service", message: err?.message ?? String(err) });
  }
});

// ── cli_tools ─────────────────────────────────────────────────────

// GET /terrain/cli-tools
router.get("/cli-tools", async (_req: Request, res: Response) => {
  try {
    const rows = await query(
      `SELECT id, name, tool_path, description, invocation, language, category, notes, is_internal
       FROM cli_tools ORDER BY name`
    );
    res.json({ cliTools: rows, count: rows.length });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to list CLI tools", message: err?.message ?? String(err) });
  }
});

// POST /terrain/cli-tools
router.post("/cli-tools", async (req: Request, res: Response) => {
  try {
    const args = req.body ?? {};
    const existing = await query(`SELECT id FROM cli_tools WHERE name = $1`, [args.name]);
    let row: any;
    const fields = ["tool_path", "description", "invocation", "language", "category", "notes", "startup", "health", "startup_script", "build_command"];
    if (existing.length > 0) {
      const sets: string[] = []; const vals: any[] = []; let i = 1;
      for (const f of fields) {
        if (args[f] !== undefined) { sets.push(`${f} = $${i++}`); vals.push(args[f]); }
      }
      if (sets.length > 0) {
        vals.push(existing[0].id);
        const result = await query(`UPDATE cli_tools SET ${sets.join(", ")} WHERE id = $${i} RETURNING *`, vals);
        row = result[0];
      } else {
        row = existing[0];
      }
    } else {
      const cols = ["name"]; const placeholders = ["$1"]; const vals: any[] = [args.name]; let i = 2;
      for (const f of fields) {
        if (args[f] !== undefined) { cols.push(f); placeholders.push(`$${i++}`); vals.push(args[f]); }
      }
      const result = await query(
        `INSERT INTO cli_tools (${cols.join(", ")}) VALUES (${placeholders.join(", ")}) RETURNING *`,
        vals
      );
      row = result[0];
    }
    res.json({ registered: row, action: existing.length > 0 ? "updated" : "created" });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to register CLI tool", message: err?.message ?? String(err) });
  }
});

// ── service lookups ────────────────────────────────────────────────

// GET /terrain/services/:name
router.get("/services/:name", async (req: Request, res: Response) => {
  try {
    const name = req.params.name;
    const mcp = await query(
      `SELECT id, name, port, status, health_check_url, startup, description, 'MCP Server' AS type
       FROM mcp_servers WHERE name = $1`,
      [name]
    );
    if (mcp.length > 0) return res.json(mcp[0]);

    const svc = await query(
      `SELECT rs.id, rs.name, rs.port, rs.status, rs.health_check_url, rs.startup, rs.description,
              st.name AS service_type, 'Runnable Service' AS type
       FROM runnable_services rs
       LEFT JOIN service_types st ON st.id = rs.service_type_id
       WHERE rs.name = $1`,
      [name]
    );
    if (svc.length > 0) return res.json(svc[0]);

    const host = await query(
      `SELECT id, hostname AS name, ip_address, os, status, notes, 'Server' AS type
       FROM servers WHERE hostname = $1`,
      [name]
    );
    if (host.length > 0) return res.json(host[0]);

    res.status(404).json({ error: `Service "${name}" not found in any terrain table` });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to look up service", message: err?.message ?? String(err) });
  }
});

// GET /terrain/services/:name/running
router.get("/services/:name/running", async (req: Request, res: Response) => {
  try {
    const name = req.params.name;
    const mcp = await query(
      `SELECT status FROM mcp_servers WHERE name = $1 AND status = 'ONLINE'`,
      [name]
    );
    if (mcp.length > 0) return res.json({ name, running: true, source: "MCP Server" });

    const svc = await query(
      `SELECT status FROM runnable_services WHERE name = $1 AND status = 'ONLINE'`,
      [name]
    );
    if (svc.length > 0) return res.json({ name, running: true, source: "Runnable Service" });

    const exists = await query(
      `SELECT id, name, 'MCP Server' AS source, status FROM mcp_servers WHERE name = $1
       UNION ALL
       SELECT id, name, 'Runnable Service' AS source, status FROM runnable_services WHERE name = $1`,
      [name]
    );
    if (exists.length > 0) {
      return res.json({ name, running: false, status: exists[0].status, source: exists[0].source });
    }
    res.json({ name, running: false, error: "not found in terrain" });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to check service running", message: err?.message ?? String(err) });
  }
});

// PATCH /terrain/services/status  body: {name, status}
router.patch("/services/status", async (req: Request, res: Response) => {
  try {
    const { name, status } = req.body ?? {};
    if (!name || !status) return res.status(400).json({ error: "name and status are required" });

    const mcp = await query(
      `UPDATE mcp_servers SET status = $1 WHERE name = $2 RETURNING id, name, status, 'MCP Server' AS type`,
      [status, name]
    );
    if (mcp.length > 0) return res.json(mcp[0]);

    const svc = await query(
      `UPDATE runnable_services SET status = $1 WHERE name = $2 RETURNING id, name, status, 'Runnable Service' AS type`,
      [status, name]
    );
    if (svc.length > 0) return res.json(svc[0]);

    res.status(404).json({ error: `Service "${name}" not found in any terrain table` });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to set service status", message: err?.message ?? String(err) });
  }
});

// ── dependencies ──────────────────────────────────────────────────

// GET /terrain/dependencies
router.get("/dependencies", async (_req: Request, res: Response) => {
  try {
    const rows = await query(
      `SELECT sd.id, sd.source_type, sd.source_id, sd.target_type, sd.target_id, sd.criticality, sd.description,
              COALESCE(ms.name, rs_src.name) AS source_name,
              COALESCE(rs.name, ms_tgt.name) AS target_name
       FROM service_dependencies sd
       LEFT JOIN mcp_servers ms ON sd.source_type = 'mcp_server' AND sd.source_id = ms.id
       LEFT JOIN runnable_services rs_src ON sd.source_type = 'runnable_service' AND sd.source_id = rs_src.id
       LEFT JOIN runnable_services rs ON sd.target_type = 'runnable_service' AND sd.target_id = rs.id
       LEFT JOIN mcp_servers ms_tgt ON sd.target_type = 'mcp_server' AND sd.target_id = ms_tgt.id
       ORDER BY sd.source_type, source_name`
    );
    res.json({ dependencies: rows, count: rows.length });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to list dependencies", message: err?.message ?? String(err) });
  }
});

// POST /terrain/dependencies
router.post("/dependencies", async (req: Request, res: Response) => {
  try {
    const args = req.body ?? {};
    const resolveId = async (type: string, name: string): Promise<string | null> => {
      const sql = type === "mcp_server"
        ? `SELECT id FROM mcp_servers WHERE name = $1`
        : `SELECT id FROM runnable_services WHERE name = $1`;
      const rows = await query(sql, [name]);
      return rows.length > 0 ? rows[0].id : null;
    };
    const sourceId = await resolveId(args.source_type, args.source_name);
    if (!sourceId) return res.status(404).json({ error: `Source service "${args.source_name}" not found in terrain.${args.source_type === "mcp_server" ? "mcp_servers" : "runnable_services"}` });
    const targetId = await resolveId(args.target_type, args.target_name);
    if (!targetId) return res.status(404).json({ error: `Target service "${args.target_name}" not found in terrain.${args.target_type === "mcp_server" ? "mcp_servers" : "runnable_services"}` });

    const existing = await query(
      `SELECT id FROM service_dependencies WHERE source_type = $1 AND source_id = $2 AND target_type = $3 AND target_id = $4`,
      [args.source_type, sourceId, args.target_type, targetId]
    );

    let row: any;
    let action: string;
    if (existing.length > 0) {
      const sets: string[] = []; const vals: any[] = []; let i = 1;
      if (args.criticality !== undefined) { sets.push(`criticality = $${i++}`); vals.push(args.criticality); }
      if (args.description !== undefined) { sets.push(`description = $${i++}`); vals.push(args.description); }
      if (sets.length > 0) {
        vals.push(existing[0].id);
        const result = await query(`UPDATE service_dependencies SET ${sets.join(", ")} WHERE id = $${i} RETURNING *`, vals);
        row = result[0];
      } else {
        row = existing[0];
      }
      action = "updated";
    } else {
      const result = await query(
        `INSERT INTO service_dependencies (source_type, source_id, target_type, target_id, criticality, description)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
        [args.source_type, sourceId, args.target_type, targetId, args.criticality ?? "medium", args.description ?? null]
      );
      row = result[0];
      action = "created";
    }
    res.json({
      dependency: {
        id: row.id,
        source_type: row.source_type,
        source_name: args.source_name,
        source_id: row.source_id,
        target_type: row.target_type,
        target_name: args.target_name,
        target_id: row.target_id,
        criticality: row.criticality,
        description: row.description,
      },
      action,
    });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to register dependency", message: err?.message ?? String(err) });
  }
});

// ── summary ──────────────────────────────────────────────────────

// GET /terrain/summary
router.get("/summary", async (_req: Request, res: Response) => {
  try {
    const [mcpCount, svcCount, srvCount, toolCount,
           onlineMcp, onlineSvc, offlineSvc, depCount] = await Promise.all([
      query("SELECT COUNT(*)::int AS count FROM mcp_servers"),
      query("SELECT COUNT(*)::int AS count FROM runnable_services"),
      query("SELECT COUNT(*)::int AS count FROM servers"),
      query("SELECT COUNT(*)::int AS count FROM cli_tools"),
      query("SELECT COUNT(*)::int AS count FROM mcp_servers WHERE status = 'ONLINE'"),
      query("SELECT COUNT(*)::int AS count FROM runnable_services WHERE status = 'ONLINE'"),
      query("SELECT COUNT(*)::int AS count FROM runnable_services WHERE status = 'OFFLINE'"),
      query("SELECT COUNT(*)::int AS count FROM service_dependencies"),
    ]);

    res.json({
      servers: srvCount[0].count,
      mcpServers: { total: mcpCount[0].count, online: onlineMcp[0].count },
      runnableServices: { total: svcCount[0].count, online: onlineSvc[0].count, offline: offlineSvc[0].count },
      cliTools: toolCount[0].count,
      dependencies: { total: depCount[0].count },
    });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to compute summary", message: err?.message ?? String(err) });
  }
});

export default router;
