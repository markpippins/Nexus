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
    // Re-homed nebula-srv SQL runs against the nebula schema (the original
    // pool carried `-c search_path=nebula`). Named connection so the giant
    // port's unqualified table names resolve exactly as they did upstream.
    nebula: {
      client: 'pg',
      connection: {
        host: env.get('PG_HOST'),
        port: env.get('PG_PORT'),
        user: env.get('PG_USER'),
        password: env.get('PG_PASSWORD'),
        database: env.get('PG_DB_NAME'),
      },
      searchPath: ['nebula', 'public'],
      pool: { min: 2, max: 10 },
    },
    // Re-homed conduit-srv SQL runs with search_path=conduit,vision,peb,tackle
    // (the original pool carried `-c search_path=conduit,vision,peb,tackle`).
    // Unqualified names like `sessions`, `circuit_breaker`, `transition_event`
    // resolve exactly as they did upstream.
    conduit: {
      client: 'pg',
      connection: {
        host: env.get('PG_HOST'),
        port: env.get('PG_PORT'),
        user: env.get('PG_USER'),
        password: env.get('PG_PASSWORD'),
        database: env.get('PG_DB_NAME'),
      },
      searchPath: ['conduit', 'vision', 'peb', 'tackle'],
      pool: { min: 2, max: 10 },
    },
  },
})

export default dbConfig
