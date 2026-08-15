import type { HttpContext } from '@adonisjs/core/http'
import db from '@adonisjs/lucid/services/db'

/**
 * terrain-srv routes, re-homed onto the control-plane edge (Wave 2.3).
 * Same wire surface as the retired Express service, backed by the
 * terrain.* schema (servers, mcp_servers, runnable_services, cli_tools,
 * service_dependencies, service_types). All table names are
 * schema-qualified so they resolve regardless of the edge's search_path.
 *
 * NOTE: Lucid rawQuery bindings go through knex, so placeholders are `?`.
 */

function errResponse(response: any, status: number, error: string, message: string) {
  return response.status(status).json({ error, message })
}

export default class TerrainController {
  /** GET /terrain/servers */
  async servers({ response }: HttpContext) {
    try {
      const { rows } = await db.rawQuery(
        `SELECT id, hostname, ip_address, os, status, startup, notes, is_internal, active_flag
         FROM terrain.servers ORDER BY hostname`,
      )
      return response.json({ servers: rows, count: rows.length })
    } catch (err: any) {
      return errResponse(response, 500, 'Failed to list servers', err?.message ?? String(err))
    }
  }

  /** GET /terrain/mcp-servers */
  async mcpServers({ response }: HttpContext) {
    try {
      const { rows } = await db.rawQuery(
        `SELECT id, name, port, workspace_path, health_check_url, status, transport_type, version, description, startup, health, is_internal
         FROM terrain.mcp_servers ORDER BY name`,
      )
      return response.json({ mcpServers: rows, count: rows.length })
    } catch (err: any) {
      return errResponse(response, 500, 'Failed to list MCP servers', err?.message ?? String(err))
    }
  }

  /** POST /terrain/mcp-servers — upsert by name. */
  async registerMcpServer({ request, response }: HttpContext) {
    try {
      const args = request.body() ?? {}
      const { rows: existing } = await db.rawQuery('SELECT id FROM terrain.mcp_servers WHERE name = ?', [args.name])
      let row: any
      if (existing.length > 0) {
        const id = existing[0].id
        const sets: string[] = []
        const vals: any[] = []
        const fields = ['port', 'workspace_path', 'health_check_url', 'status', 'transport_type', 'version', 'description', 'startup', 'health']
        for (const f of fields) {
          if (args[f] !== undefined) { sets.push(`${f} = ?`); vals.push(args[f]) }
        }
        if (sets.length > 0) {
          vals.push(id)
          const { rows } = await db.rawQuery(`UPDATE terrain.mcp_servers SET ${sets.join(', ')} WHERE id = ? RETURNING *`, vals)
          row = rows[0]
        } else {
          row = existing[0]
        }
      } else {
        const cols = ['name', 'service_type_id']
        const placeholders: string[] = ['?', '?']
        const vals: any[] = [args.name, 1] // 1 = MCP service type
        const fields = ['port', 'workspace_path', 'health_check_url', 'status', 'transport_type', 'version', 'description', 'startup', 'health']
        for (const f of fields) {
          if (args[f] !== undefined) { cols.push(f); placeholders.push('?'); vals.push(args[f]) }
        }
        const { rows } = await db.rawQuery(`INSERT INTO terrain.mcp_servers (${cols.join(', ')}) VALUES (${placeholders.join(', ')}) RETURNING *`, vals)
        row = rows[0]
      }
      return response.json({ registered: row, action: existing.length > 0 ? 'updated' : 'created' })
    } catch (err: any) {
      return errResponse(response, 500, 'Failed to register MCP server', err?.message ?? String(err))
    }
  }

  /** GET /terrain/runnable-services */
  async runnableServices({ response }: HttpContext) {
    try {
      const { rows } = await db.rawQuery(
        `SELECT rs.id, rs.name, rs.port, rs.workspace_path, rs.health_check_url, rs.status,
                rs.version, rs.description, rs.repository_url, rs.startup, rs.health, rs.is_internal,
                st.name AS service_type
         FROM terrain.runnable_services rs
         LEFT JOIN terrain.service_types st ON st.id = rs.service_type_id
         ORDER BY rs.name`,
      )
      return response.json({ services: rows, count: rows.length })
    } catch (err: any) {
      return errResponse(response, 500, 'Failed to list runnable services', err?.message ?? String(err))
    }
  }

  /** POST /terrain/runnable-services — upsert by name. */
  async registerRunnableService({ request, response }: HttpContext) {
    try {
      const args = request.body() ?? {}
      const { rows: existing } = await db.rawQuery('SELECT id FROM terrain.runnable_services WHERE name = ?', [args.name])
      let row: any
      if (existing.length > 0) {
        const id = existing[0].id
        const sets: string[] = []
        const vals: any[] = []
        const fields = ['port', 'workspace_path', 'health_check_url', 'status', 'version', 'description', 'startup', 'health', 'service_type_id']
        for (const f of fields) {
          if (args[f] !== undefined) { sets.push(`${f} = ?`); vals.push(args[f]) }
        }
        if (sets.length > 0) {
          vals.push(id)
          const { rows } = await db.rawQuery(`UPDATE terrain.runnable_services SET ${sets.join(', ')} WHERE id = ? RETURNING *`, vals)
          row = rows[0]
        } else {
          row = existing[0]
        }
      } else {
        const serviceTypeId = args.service_type_id ?? 3 // default: Express
        const cols = ['name', 'service_type_id']
        const placeholders: string[] = ['?', '?']
        const vals: any[] = [args.name, serviceTypeId]
        const fields = ['port', 'workspace_path', 'health_check_url', 'status', 'version', 'description', 'startup', 'health']
        for (const f of fields) {
          if (args[f] !== undefined) { cols.push(f); placeholders.push('?'); vals.push(args[f]) }
        }
        const { rows } = await db.rawQuery(`INSERT INTO terrain.runnable_services (${cols.join(', ')}) VALUES (${placeholders.join(', ')}) RETURNING *`, vals)
        row = rows[0]
      }
      return response.json({ registered: row, action: existing.length > 0 ? 'updated' : 'created' })
    } catch (err: any) {
      return errResponse(response, 500, 'Failed to register runnable service', err?.message ?? String(err))
    }
  }

  /** GET /terrain/cli-tools */
  async cliTools({ response }: HttpContext) {
    try {
      const { rows } = await db.rawQuery(
        `SELECT id, name, tool_path, description, invocation, language, category, notes, is_internal
         FROM terrain.cli_tools ORDER BY name`,
      )
      return response.json({ cliTools: rows, count: rows.length })
    } catch (err: any) {
      return errResponse(response, 500, 'Failed to list CLI tools', err?.message ?? String(err))
    }
  }

  /** POST /terrain/cli-tools — upsert by name. */
  async registerCliTool({ request, response }: HttpContext) {
    try {
      const args = request.body() ?? {}
      const { rows: existing } = await db.rawQuery('SELECT id FROM terrain.cli_tools WHERE name = ?', [args.name])
      let row: any
      const fields = ['tool_path', 'description', 'invocation', 'language', 'category', 'notes', 'startup', 'health', 'startup_script', 'build_command']
      if (existing.length > 0) {
        const sets: string[] = []
        const vals: any[] = []
        for (const f of fields) {
          if (args[f] !== undefined) { sets.push(`${f} = ?`); vals.push(args[f]) }
        }
        if (sets.length > 0) {
          vals.push(existing[0].id)
          const { rows } = await db.rawQuery(`UPDATE terrain.cli_tools SET ${sets.join(', ')} WHERE id = ? RETURNING *`, vals)
          row = rows[0]
        } else {
          row = existing[0]
        }
      } else {
        const cols = ['name']
        const placeholders: string[] = ['?']
        const vals: any[] = [args.name]
        for (const f of fields) {
          if (args[f] !== undefined) { cols.push(f); placeholders.push('?'); vals.push(args[f]) }
        }
        const { rows } = await db.rawQuery(`INSERT INTO terrain.cli_tools (${cols.join(', ')}) VALUES (${placeholders.join(', ')}) RETURNING *`, vals)
        row = rows[0]
      }
      return response.json({ registered: row, action: existing.length > 0 ? 'updated' : 'created' })
    } catch (err: any) {
      return errResponse(response, 500, 'Failed to register CLI tool', err?.message ?? String(err))
    }
  }

  /** GET /terrain/services/:name — lookup across mcp/runnable/server. */
  async serviceLookup({ params, response }: HttpContext) {
    try {
      const name = params.name
      const mcp = await db.rawQuery(
        `SELECT id, name, port, status, health_check_url, startup, description, 'MCP Server' AS type
         FROM terrain.mcp_servers WHERE name = ?`, [name],
      )
      if (mcp.rows.length > 0) return response.json(mcp.rows[0])
      const svc = await db.rawQuery(
        `SELECT rs.id, rs.name, rs.port, rs.status, rs.health_check_url, rs.startup, rs.description,
                st.name AS service_type, 'Runnable Service' AS type
         FROM terrain.runnable_services rs
         LEFT JOIN terrain.service_types st ON st.id = rs.service_type_id
         WHERE rs.name = ?`, [name],
      )
      if (svc.rows.length > 0) return response.json(svc.rows[0])
      const host = await db.rawQuery(
        `SELECT id, hostname AS name, ip_address, os, status, notes, 'Server' AS type
         FROM terrain.servers WHERE hostname = ?`, [name],
      )
      if (host.rows.length > 0) return response.json(host.rows[0])
      return errResponse(response, 404, `Service "${name}" not found in any terrain table`, '')
    } catch (err: any) {
      return errResponse(response, 500, 'Failed to look up service', err?.message ?? String(err))
    }
  }

  /** GET /terrain/services/:name/running */
  async serviceRunning({ params, response }: HttpContext) {
    try {
      const name = params.name
      const mcp = await db.rawQuery(`SELECT status FROM terrain.mcp_servers WHERE name = ? AND status = 'ONLINE'`, [name])
      if (mcp.rows.length > 0) return response.json({ name, running: true, source: 'MCP Server' })
      const svc = await db.rawQuery(`SELECT status FROM terrain.runnable_services WHERE name = ? AND status = 'ONLINE'`, [name])
      if (svc.rows.length > 0) return response.json({ name, running: true, source: 'Runnable Service' })
      const exists = await db.rawQuery(
        `SELECT id, name, 'MCP Server' AS source, status FROM terrain.mcp_servers WHERE name = ?
         UNION ALL
         SELECT id, name, 'Runnable Service' AS source, status FROM terrain.runnable_services WHERE name = ?`, [name, name],
      )
      if (exists.rows.length > 0) {
        return response.json({ name, running: false, status: exists.rows[0].status, source: exists.rows[0].source })
      }
      return response.json({ name, running: false, error: 'not found in terrain' })
    } catch (err: any) {
      return errResponse(response, 500, 'Failed to check service running', err?.message ?? String(err))
    }
  }

  /** PATCH /terrain/services/status — body: {name, status}. */
  async setServiceStatus({ request, response }: HttpContext) {
    try {
      const { name, status } = request.body() ?? {}
      if (!name || !status) return errResponse(response, 400, 'name and status are required', '')
      const mcp = await db.rawQuery(
        `UPDATE terrain.mcp_servers SET status = ? WHERE name = ? RETURNING id, name, status, 'MCP Server' AS type`, [status, name],
      )
      if (mcp.rows.length > 0) return response.json(mcp.rows[0])
      const svc = await db.rawQuery(
        `UPDATE terrain.runnable_services SET status = ? WHERE name = ? RETURNING id, name, status, 'Runnable Service' AS type`, [status, name],
      )
      if (svc.rows.length > 0) return response.json(svc.rows[0])
      return errResponse(response, 404, `Service "${name}" not found in any terrain table`, '')
    } catch (err: any) {
      return errResponse(response, 500, 'Failed to set service status', err?.message ?? String(err))
    }
  }

  /** GET /terrain/dependencies */
  async dependencies({ response }: HttpContext) {
    try {
      const { rows } = await db.rawQuery(
        `SELECT sd.id, sd.source_type, sd.source_id, sd.target_type, sd.target_id, sd.criticality, sd.description,
                COALESCE(ms.name, rs_src.name) AS source_name,
                COALESCE(rs.name, ms_tgt.name) AS target_name
         FROM terrain.service_dependencies sd
         LEFT JOIN terrain.mcp_servers ms ON sd.source_type = 'mcp_server' AND sd.source_id = ms.id
         LEFT JOIN terrain.runnable_services rs_src ON sd.source_type = 'runnable_service' AND sd.source_id = rs_src.id
         LEFT JOIN terrain.runnable_services rs ON sd.target_type = 'runnable_service' AND sd.target_id = rs.id
         LEFT JOIN terrain.mcp_servers ms_tgt ON sd.target_type = 'mcp_server' AND sd.target_id = ms_tgt.id
         ORDER BY sd.source_type, source_name`,
      )
      return response.json({ dependencies: rows, count: rows.length })
    } catch (err: any) {
      return errResponse(response, 500, 'Failed to list dependencies', err?.message ?? String(err))
    }
  }

  /** POST /terrain/dependencies — upsert by resolved source/target. */
  async registerDependency({ request, response }: HttpContext) {
    try {
      const args = request.body() ?? {}
      const resolveId = async (type: string, name: string) => {
        const sql = type === 'mcp_server'
          ? 'SELECT id FROM terrain.mcp_servers WHERE name = ?'
          : 'SELECT id FROM terrain.runnable_services WHERE name = ?'
        const { rows } = await db.rawQuery(sql, [name])
        return rows.length > 0 ? rows[0].id : null
      }
      const sourceId = await resolveId(args.source_type, args.source_name)
      if (!sourceId) {
        return errResponse(response, 404, `Source service "${args.source_name}" not found in terrain.${args.source_type === 'mcp_server' ? 'mcp_servers' : 'runnable_services'}`, '')
      }
      const targetId = await resolveId(args.target_type, args.target_name)
      if (!targetId) {
        return errResponse(response, 404, `Target service "${args.target_name}" not found in terrain.${args.target_type === 'mcp_server' ? 'mcp_servers' : 'runnable_services'}`, '')
      }
      const { rows: existing } = await db.rawQuery(
        `SELECT id FROM terrain.service_dependencies WHERE source_type = ? AND source_id = ? AND target_type = ? AND target_id = ?`,
        [args.source_type, sourceId, args.target_type, targetId],
      )
      let row: any
      let action: string
      if (existing.length > 0) {
        const sets: string[] = []
        const vals: any[] = []
        if (args.criticality !== undefined) { sets.push('criticality = ?'); vals.push(args.criticality) }
        if (args.description !== undefined) { sets.push('description = ?'); vals.push(args.description) }
        if (sets.length > 0) {
          vals.push(existing[0].id)
          const { rows } = await db.rawQuery(`UPDATE terrain.service_dependencies SET ${sets.join(', ')} WHERE id = ? RETURNING *`, vals)
          row = rows[0]
        } else {
          row = existing[0]
        }
        action = 'updated'
      } else {
        const { rows } = await db.rawQuery(
          `INSERT INTO terrain.service_dependencies (source_type, source_id, target_type, target_id, criticality, description)
           VALUES (?, ?, ?, ?, ?, ?) RETURNING *`,
          [args.source_type, sourceId, args.target_type, targetId, args.criticality ?? 'medium', args.description ?? null],
        )
        row = rows[0]
        action = 'created'
      }
      return response.json({
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
      })
    } catch (err: any) {
      return errResponse(response, 500, 'Failed to register dependency', err?.message ?? String(err))
    }
  }

  /** GET /terrain/summary */
  async summary({ response }: HttpContext) {
    try {
      const [mcpCount, svcCount, srvCount, toolCount, onlineMcp, onlineSvc, offlineSvc, depCount] = await Promise.all([
        db.rawQuery('SELECT COUNT(*)::int AS count FROM terrain.mcp_servers'),
        db.rawQuery('SELECT COUNT(*)::int AS count FROM terrain.runnable_services'),
        db.rawQuery('SELECT COUNT(*)::int AS count FROM terrain.servers'),
        db.rawQuery('SELECT COUNT(*)::int AS count FROM terrain.cli_tools'),
        db.rawQuery("SELECT COUNT(*)::int AS count FROM terrain.mcp_servers WHERE status = 'ONLINE'"),
        db.rawQuery("SELECT COUNT(*)::int AS count FROM terrain.runnable_services WHERE status = 'ONLINE'"),
        db.rawQuery("SELECT COUNT(*)::int AS count FROM terrain.runnable_services WHERE status = 'OFFLINE'"),
        db.rawQuery('SELECT COUNT(*)::int AS count FROM terrain.service_dependencies'),
      ])
      return response.json({
        servers: srvCount.rows[0].count,
        mcpServers: { total: mcpCount.rows[0].count, online: onlineMcp.rows[0].count },
        runnableServices: { total: svcCount.rows[0].count, online: onlineSvc.rows[0].count, offline: offlineSvc.rows[0].count },
        cliTools: toolCount.rows[0].count,
        dependencies: { total: depCount.rows[0].count },
      })
    } catch (err: any) {
      return errResponse(response, 500, 'Failed to compute summary', err?.message ?? String(err))
    }
  }
}
