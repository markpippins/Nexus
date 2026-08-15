import env from '#start/env'
import { defineConfig } from '@adonisjs/lucid'

/**
 * PostgreSQL remains the canonical store (AGENTS.md Tier 1).
 * The consolidated edge processes talk to the same PG the Express
 * services talked to — no schema migration required to re-home.
 */
const dbConfig = defineConfig({
  connection: 'pg',
  connections: {
    pg: {
      client: 'pg',
      connection: {
        host: env.get('PG_HOST'),
        port: env.get('PG_PORT'),
        user: env.get('PG_USER'),
        password: env.get('PG_PASSWORD'),
        database: env.get('PG_DB_NAME'),
      },
      // Re-homed knowledge-srv SQL uses unqualified table names against the
      // knowledge schema (same search_path as the original service).
      searchPath: ['knowledge', 'public'],
      pool: { min: 2, max: 10 },
      migrations: {
        naturalSort: true,
        paths: ['database/migrations'],
      },
    },
  },
})

export default dbConfig
