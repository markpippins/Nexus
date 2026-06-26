// migrate-service-registry-to-pg.js
// Reads service-registry JSON config files and inserts directly into PostgreSQL registry schema.
// Requires: pg module (available from conduit-mcp or nebula-srv)

const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const SERVICE_REGISTRY_CONFIG = '/home/codex/dev/nexus/jvm/spring/service-registry/src/main/resources/config';

const pool = new Pool({
  host: 'localhost',
  port: 5432,
  user: 'pguser',
  password: 'pgpass',
  database: 'nexus',
  options: '-c search_path=registry',
  max: 1,
  connectionTimeoutMillis: 5000,
});

const NOW = new Date().toISOString();

async function exec(sql, params = []) {
  return pool.query(sql, params);
}

function readJson(filename) {
  const filePath = path.join(SERVICE_REGISTRY_CONFIG, filename);
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
}

async function createTables() {
  console.log('Creating tables in registry schema...');

  // Lookup tables
  await exec(`CREATE TABLE IF NOT EXISTS registry.framework_categories (
    id BIGSERIAL PRIMARY KEY, name VARCHAR(255) NOT NULL UNIQUE,
    description VARCHAR(1000), created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW()
  )`);
  await exec(`CREATE TABLE IF NOT EXISTS registry.framework_languages (
    id BIGSERIAL PRIMARY KEY, name VARCHAR(255) NOT NULL UNIQUE,
    description VARCHAR(1000), created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW()
  )`);
  await exec(`CREATE TABLE IF NOT EXISTS registry.framework_vendors (
    id BIGSERIAL PRIMARY KEY, name VARCHAR(255) NOT NULL UNIQUE,
    description VARCHAR(1000), url VARCHAR(500), created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW()
  )`);
  await exec(`CREATE TABLE IF NOT EXISTS registry.service_types (
    id BIGSERIAL PRIMARY KEY, name VARCHAR(255) NOT NULL UNIQUE,
    description VARCHAR(1000), created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW()
  )`);
  await exec(`CREATE TABLE IF NOT EXISTS registry.server_type (
    id BIGSERIAL PRIMARY KEY, name VARCHAR(255) NOT NULL UNIQUE,
    description VARCHAR(1000), created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW()
  )`);
  await exec(`CREATE TABLE IF NOT EXISTS registry.environment_types (
    id BIGSERIAL PRIMARY KEY, name VARCHAR(255) NOT NULL UNIQUE,
    description VARCHAR(1000), created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW()
  )`);
  await exec(`CREATE TABLE IF NOT EXISTS registry.operating_systems (
    id BIGSERIAL PRIMARY KEY, name VARCHAR(255) NOT NULL,
    version VARCHAR(50), architecture VARCHAR(50),
    created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW()
  )`);
  await exec(`CREATE TABLE IF NOT EXISTS registry.library_categories (
    id BIGSERIAL PRIMARY KEY, name VARCHAR(255) NOT NULL UNIQUE,
    description VARCHAR(1000), created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW()
  )`);

  // Entity tables with FKs
  await exec(`CREATE TABLE IF NOT EXISTS registry.frameworks (
    id BIGSERIAL PRIMARY KEY, name VARCHAR(255) NOT NULL UNIQUE,
    description VARCHAR(1000),
    category_id BIGINT REFERENCES registry.framework_categories(id),
    language_id BIGINT REFERENCES registry.framework_languages(id),
    vendor_id BIGINT REFERENCES registry.framework_vendors(id),
    current_version VARCHAR(50), lts_version VARCHAR(50),
    url VARCHAR(500), supports_broker_pattern BOOLEAN DEFAULT FALSE,
    active_flag BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW()
  )`);

  await exec(`CREATE TABLE IF NOT EXISTS registry.servers (
    id BIGSERIAL PRIMARY KEY, hostname VARCHAR(255) NOT NULL UNIQUE,
    ip_address VARCHAR(50), server_type_id BIGINT REFERENCES registry.server_type(id),
    environment_type_id BIGINT REFERENCES registry.environment_types(id),
    operating_system_id BIGINT REFERENCES registry.operating_systems(id),
    cpu_cores INTEGER, memory VARCHAR(50), disk VARCHAR(50),
    status VARCHAR(50), region VARCHAR(100), cloud_provider VARCHAR(100),
    description VARCHAR(1000), active_flag BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW()
  )`);

  await exec(`CREATE TABLE IF NOT EXISTS registry.services (
    id BIGSERIAL PRIMARY KEY, name VARCHAR(255) NOT NULL UNIQUE,
    description VARCHAR(1000),
    framework_id BIGINT REFERENCES registry.frameworks(id),
    service_type_id BIGINT REFERENCES registry.service_types(id),
    component_override_id BIGINT, parent_service_id BIGINT REFERENCES registry.services(id),
    default_port INTEGER, api_base_path VARCHAR(255), repository_url VARCHAR(500),
    version VARCHAR(50), status VARCHAR(50), active_flag BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW()
  )`);

  await exec(`CREATE TABLE IF NOT EXISTS registry.libraries (
    id BIGSERIAL PRIMARY KEY, name VARCHAR(255) NOT NULL,
    description VARCHAR(1000), category_id BIGINT REFERENCES registry.library_categories(id),
    language_id BIGINT REFERENCES registry.framework_languages(id),
    current_version VARCHAR(50), package_name VARCHAR(255), package_manager VARCHAR(50),
    url VARCHAR(500), repository_url VARCHAR(500), license VARCHAR(100),
    created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW()
  )`);

  await exec(`CREATE TABLE IF NOT EXISTS registry.deployments (
    id BIGSERIAL PRIMARY KEY,
    service_id BIGINT REFERENCES registry.services(id),
    server_id BIGINT REFERENCES registry.servers(id),
    environment_id BIGINT REFERENCES registry.environment_types(id),
    version VARCHAR(50), port INTEGER, context_path VARCHAR(255),
    status VARCHAR(50), health_check_url VARCHAR(500), health_status VARCHAR(50),
    last_health_check TIMESTAMPTZ, process_id VARCHAR(100),
    container_name VARCHAR(255), deployment_path VARCHAR(500),
    deployed_at TIMESTAMPTZ, started_at TIMESTAMPTZ, stopped_at TIMESTAMPTZ,
    active_flag BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW()
  )`);

  await exec(`CREATE TABLE IF NOT EXISTS registry.service_dependencies (
    id BIGSERIAL PRIMARY KEY,
    service_id BIGINT NOT NULL REFERENCES registry.services(id),
    target_service_id BIGINT NOT NULL REFERENCES registry.services(id),
    criticality VARCHAR(50), description VARCHAR(1000),
    active_flag BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(service_id, target_service_id)
  )`);

  await exec(`CREATE TABLE IF NOT EXISTS registry.service_configs (
    id BIGSERIAL PRIMARY KEY,
    service_id BIGINT REFERENCES registry.services(id),
    config_key VARCHAR(255) NOT NULL, config_value VARCHAR(4000) NOT NULL,
    config_type_id BIGINT, environment_id BIGINT REFERENCES registry.environment_types(id),
    description VARCHAR(1000), active_flag BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW()
  )`);

  await exec(`CREATE TABLE IF NOT EXISTS registry.service_config_types (
    id BIGSERIAL PRIMARY KEY, name VARCHAR(100) NOT NULL UNIQUE
  )`);

  console.log('All tables created.');
}

async function seedLookup(table, jsonFile, extraCols = []) {
  const data = readJson(jsonFile);
  if (data.length === 0) return;

  const cols = ['name', ...extraCols];
  const colNames = cols.join(', ');
  const placeholders = cols.map((_, i) => `$${i + 1}`).join(', ');

  for (const row of data) {
    const exists = await exec(`SELECT id FROM registry.${table} WHERE name = $1`, [row.name]);
    if (exists.rows.length === 0) {
      await exec(
        `INSERT INTO registry.${table} (${colNames}) VALUES (${placeholders})`,
        cols.map(c => row[c] || null)
      );
    }
  }
  console.log(`  ${table}: ${data.length} rows`);
}

async function run() {
  try {
    await createTables();

    console.log('\n=== Seeding lookup data ===');

    // Phase 1: Simple lookups (no FKs)
    await seedLookup('environment_types', 'environment-types.json');
    await seedLookup('service_types', 'service-types.json');
    await seedLookup('server_type', 'server-types.json');
    // Operating systems: name, version, architecture
    console.log('  operating_systems: processing...');
    const osData = readJson('operating-systems.json');
    for (const row of osData) {
      const exists = await exec(`SELECT id FROM registry.operating_systems WHERE name = $1`, [row.name]);
      if (exists.rows.length === 0) {
        await exec(
          `INSERT INTO registry.operating_systems (name, version, architecture) VALUES ($1, $2, $3)`,
          [row.name, row.version || null, row.architecture || row.family || null]
        );
      }
    }
    console.log(`  operating_systems: ${osData.length} rows`);

    await seedLookup('framework_categories', 'framework-categories.json');
    await seedLookup('framework_languages', 'framework-languages.json');
    await seedLookup('framework_vendors', 'framework-vendors.json', ['url']);
    await seedLookup('library_categories', 'library-categories.json');

    // Phase 2: Frameworks (FKs: category_id, language_id)
    console.log('\n=== Seeding frameworks ===');
    const frameworks = readJson('frameworks.json');
    for (const fw of frameworks) {
      const exists = await exec(`SELECT id FROM registry.frameworks WHERE name = $1`, [fw.name]);
      if (exists.rows.length === 0) {
        const cat = await exec(`SELECT id FROM registry.framework_categories WHERE name = $1`, [fw.category]);
        const lang = await exec(`SELECT id FROM registry.framework_languages WHERE name = $1`, [fw.language]);
        if (cat.rows.length > 0 && lang.rows.length > 0) {
          await exec(
            `INSERT INTO registry.frameworks (name, description, category_id, language_id, current_version, lts_version, url, supports_broker_pattern) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
            [fw.name, fw.description, cat.rows[0].id, lang.rows[0].id, fw.current_version, fw.lts_version, fw.url, fw.supports_broker_pattern || false]
          );
        }
      }
    }
    console.log(`  frameworks: ${frameworks.length} rows`);

    // Phase 3: Hosts/Servers (FKs: server_type_id, environment_type_id, operating_system_id)
    console.log('\n=== Seeding hosts ===');
    const servers = readJson('servers.json');
    for (const srv of servers) {
      const exists = await exec(`SELECT id FROM registry.servers WHERE hostname = $1`, [srv.hostname]);
      if (exists.rows.length === 0) {
        const sType = await exec(`SELECT id FROM registry.server_type WHERE name = $1`, [srv.type]);
        const env = await exec(`SELECT id FROM registry.environment_types WHERE name = $1`, [srv.environment]);
        const os = await exec(`SELECT id FROM registry.operating_systems WHERE name = $1`, [srv.operatingSystem]);
        if (sType.rows.length > 0 && env.rows.length > 0 && os.rows.length > 0) {
          await exec(
            `INSERT INTO registry.servers (hostname, ip_address, server_type_id, environment_type_id, operating_system_id, cpu_cores, memory, disk, status, description) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
            [srv.hostname, srv.ipAddress, sType.rows[0].id, env.rows[0].id, os.rows[0].id,
             srv.cpuCores, srv.memory || (srv.memoryMb ? String(srv.memoryMb) : null), srv.disk || (srv.diskGb ? String(srv.diskGb) : null),
             srv.status || 'ACTIVE', srv.description]
          );
        }
      }
    }
    console.log(`  servers: ${servers.length} rows`);

    // Phase 4: Services (FKs: framework_id, service_type_id)
    console.log('\n=== Seeding services ===');
    const services = readJson('services.json');
    for (const svc of services) {
      const exists = await exec(`SELECT id FROM registry.services WHERE name = $1`, [svc.name]);
      if (exists.rows.length === 0) {
        const fw = await exec(`SELECT id FROM registry.frameworks WHERE name = $1`, [svc.framework]);
        const st = await exec(`SELECT id FROM registry.service_types WHERE name = $1`, [svc.type]);
        if (fw.rows.length > 0 && st.rows.length > 0) {
          await exec(
            `INSERT INTO registry.services (name, description, framework_id, service_type_id, default_port, api_base_path, repository_url, version, status) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
            [svc.name, svc.description, fw.rows[0].id, st.rows[0].id, svc.defaultPort, svc.apiBasePath, svc.repositoryUrl, svc.version, svc.status]
          );
        }
      }
    }
    console.log(`  services: ${services.length} rows`);

    // Phase 5: Libraries (FKs: category_id, language_id)
    console.log('\n=== Seeding libraries ===');
    const libraries = readJson('libraries.json');
    for (const lib of libraries) {
      const exists = await exec(`SELECT id FROM registry.libraries WHERE name = $1`, [lib.name]);
      if (exists.rows.length === 0) {
        const cat = await exec(`SELECT id FROM registry.library_categories WHERE name = $1`, [lib.category]);
        const lang = await exec(`SELECT id FROM registry.framework_languages WHERE name = $1`, [lib.language]);
        if (cat.rows.length > 0 && lang.rows.length > 0) {
          await exec(
            `INSERT INTO registry.libraries (name, description, category_id, language_id, current_version, package_name, package_manager, url, repository_url, license) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
            [lib.name, lib.description, cat.rows[0].id, lang.rows[0].id, lib.current_version, lib.package_name, lib.package_manager, lib.url, lib.repository_url, lib.license]
          );
        }
      }
    }
    console.log(`  libraries: ${libraries.length} rows`);

    // Phase 6: Deployments (FKs: service_id, server_id, environment_id)
    console.log('\n=== Seeding deployments ===');
    const deployments = readJson('deployments.json');
    let depCount = 0;
    for (const dep of deployments) {
      const svc = await exec(`SELECT id FROM registry.services WHERE name = $1`, [dep.serviceName || dep.service]);
      const host = await exec(`SELECT id FROM registry.servers WHERE hostname = $1`, [dep.hostname]);
      if (svc.rows.length > 0 && host.rows.length > 0) {
        // Get environment from the host
        const hostEnv = await exec(`SELECT environment_type_id FROM registry.servers WHERE id = $1`, [host.rows[0].id]);
        if (hostEnv.rows.length > 0) {
          const exists = await exec(
            `SELECT id FROM registry.deployments WHERE service_id = $1 AND server_id = $2`,
            [svc.rows[0].id, host.rows[0].id]
          );
          if (exists.rows.length === 0) {
            await exec(
              `INSERT INTO registry.deployments (service_id, server_id, environment_id, version, port, status) VALUES ($1,$2,$3,$4,$5,$6)`,
              [svc.rows[0].id, host.rows[0].id, hostEnv.rows[0].environment_type_id,
               dep.version, dep.port, dep.status]
            );
            depCount++;
          }
        }
      }
    }
    console.log(`  deployments: ${depCount} rows`);

    // Phase 7: Service Configurations
    console.log('\n=== Seeding service configurations ===');
    const configs = readJson('service-configurations.json');
    let cfgCount = 0;
    for (const cfg of configs) {
      const svc = await exec(`SELECT id FROM registry.services WHERE name = $1`, [cfg.serviceName]);
      if (svc.rows.length > 0) {
        let envId = null;
        if (cfg.environment !== 'ALL') {
          const env = await exec(`SELECT id FROM registry.environment_types WHERE name = $1`, [cfg.environment]);
          if (env.rows.length > 0) envId = env.rows[0].id;
        }
        await exec(
          `INSERT INTO registry.service_configs (service_id, config_key, config_value, environment_id, description) VALUES ($1,$2,$3,$4,$5)`,
          [svc.rows[0].id, cfg.configKey, cfg.configValue, envId, cfg.description]
        );
        cfgCount++;
      }
    }
    console.log(`  service_configs: ${cfgCount} rows`);

    // Print final counts
    console.log('\n=== Final Row Counts ===');
    const tables = ['environment_types','service_types','server_type','operating_systems',
      'framework_categories','framework_languages','framework_vendors',
      'frameworks','servers','services','library_categories','libraries',
      'deployments','service_configs','service_dependencies'];
    for (const t of tables) {
      try {
        const r = await exec(`SELECT COUNT(*) as c FROM registry.${t}`);
        console.log(`  ${t}: ${r.rows[0].c}`);
      } catch (e) {
        console.log(`  ${t}: SKIP (${e.message.split('\n')[0]})`);
      }
    }

    console.log('\n=== Migration complete! ===');
  } catch (err) {
    console.error('Migration failed:', err);
  } finally {
    await pool.end();
  }
}

run();
