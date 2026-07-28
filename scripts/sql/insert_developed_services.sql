-- Insert developed services from terrain into nebula.systems
-- Excludes third-party tools (Temporal, NATS, PostgreSQL, MongoDB, Redis, Ollama)

-- MCP Servers
INSERT INTO nebula.systems (name, description)
SELECT 'conduit-mcp', 'WorkRequest orchestrator MCP server (port 3100, TypeScript/Express)'
WHERE NOT EXISTS (SELECT 1 FROM nebula.systems WHERE name = 'conduit-mcp');

INSERT INTO nebula.systems (name, description)
SELECT 'knowledge-mcp', 'Knowledge schema MCP server - graph entities, edges, migrations (TypeScript)'
WHERE NOT EXISTS (SELECT 1 FROM nebula.systems WHERE name = 'knowledge-mcp');

INSERT INTO nebula.systems (name, description)
SELECT 'nebula-mcp', 'Nebula RMS MCP server - SSE wrapper for canonical DB API access (port 3102, TypeScript)'
WHERE NOT EXISTS (SELECT 1 FROM nebula.systems WHERE name = 'nebula-mcp');

INSERT INTO nebula.systems (name, description)
SELECT 'peb-mcp', 'PEB Spring Boot Kernel MCP facade - governance and state management (TypeScript)'
WHERE NOT EXISTS (SELECT 1 FROM nebula.systems WHERE name = 'peb-mcp');

INSERT INTO nebula.systems (name, description)
SELECT 'tackle-mcp', 'Tackle MCP server - role memory procedure registry (port 3400, TypeScript)'
WHERE NOT EXISTS (SELECT 1 FROM nebula.systems WHERE name = 'tackle-mcp');

INSERT INTO nebula.systems (name, description)
SELECT 'terrain-mcp', 'Terrain stdio MCP server - infrastructure topology discovery and service registry queries (TypeScript)'
WHERE NOT EXISTS (SELECT 1 FROM nebula.systems WHERE name = 'terrain-mcp');

INSERT INTO nebula.systems (name, description)
SELECT 'vision-mcp', 'Vision LOSM MCP server - proxy to vision-srv (TypeScript)'
WHERE NOT EXISTS (SELECT 1 FROM nebula.systems WHERE name = 'vision-mcp');

INSERT INTO nebula.systems (name, description)
SELECT 'vision-mcp-py', 'Vision LOSM MCP server - direct implementation using losm-store (Python)'
WHERE NOT EXISTS (SELECT 1 FROM nebula.systems WHERE name = 'vision-mcp-py');

-- Runnable Services (our developed, excluding third-party)
INSERT INTO nebula.systems (name, description)
SELECT 'broker-gateway', 'Spring Boot broker gateway - request routing, orchestration, load balancing (port 8081, Java/Spring)'
WHERE NOT EXISTS (SELECT 1 FROM nebula.systems WHERE name = 'broker-gateway');

INSERT INTO nebula.systems (name, description)
SELECT 'cascade', 'Python event dispatcher - cycles events on 2s cadence, dispatches to projections'
WHERE NOT EXISTS (SELECT 1 FROM nebula.systems WHERE name = 'cascade');

INSERT INTO nebula.systems (name, description)
SELECT 'conduit-ui', 'Conduit pipeline Angular UI - visual pipeline management interface (port 4201)'
WHERE NOT EXISTS (SELECT 1 FROM nebula.systems WHERE name = 'conduit-ui');

INSERT INTO nebula.systems (name, description)
SELECT 'duality-ui', 'Duality React/Vite UI - duality visualization interface (port 3002)'
WHERE NOT EXISTS (SELECT 1 FROM nebula.systems WHERE name = 'duality-ui');

INSERT INTO nebula.systems (name, description)
SELECT 'filesystem-server', 'File system proxy server - Bun-based filesystem access layer (port 4040)'
WHERE NOT EXISTS (SELECT 1 FROM nebula.systems WHERE name = 'filesystem-server');

INSERT INTO nebula.systems (name, description)
SELECT 'image-server', 'Static image server - Express-based image serving (port 9081)'
WHERE NOT EXISTS (SELECT 1 FROM nebula.systems WHERE name = 'image-server');

INSERT INTO nebula.systems (name, description)
SELECT 'nebula-srv', 'Canonical REST API service - primary database API for the nebula schema (port 3101, TypeScript/Express)'
WHERE NOT EXISTS (SELECT 1 FROM nebula.systems WHERE name = 'nebula-srv');

INSERT INTO nebula.systems (name, description)
SELECT 'nebula-ui', 'Nebula RMS Angular UI - Requirements Management System frontend (port 3000)'
WHERE NOT EXISTS (SELECT 1 FROM nebula.systems WHERE name = 'nebula-ui');

INSERT INTO nebula.systems (name, description)
SELECT 'nexus-console', 'Nexus Console Angular UI - main management console (port 4200)'
WHERE NOT EXISTS (SELECT 1 FROM nebula.systems WHERE name = 'nexus-console');

INSERT INTO nebula.systems (name, description)
SELECT 'peb-kernel', 'Plugin Execution Bus kernel - Spring Boot service for plugin orchestration (port 8080, Java/Spring)'
WHERE NOT EXISTS (SELECT 1 FROM nebula.systems WHERE name = 'peb-kernel');

INSERT INTO nebula.systems (name, description)
SELECT 'plurality-ui', 'Plurality React/Vite UI - multi-agent collaboration interface (port 3001)'
WHERE NOT EXISTS (SELECT 1 FROM nebula.systems WHERE name = 'plurality-ui');

INSERT INTO nebula.systems (name, description)
SELECT 'service-registry', 'Spring Boot service registry with Redis-backed caching - service discovery and heartbeat management (port 8085, Java/Spring)'
WHERE NOT EXISTS (SELECT 1 FROM nebula.systems WHERE name = 'service-registry');

INSERT INTO nebula.systems (name, description)
SELECT 'terrain', 'Infrastructure topology server - central service registry, Spring Boot (port 8084, Java/Spring)'
WHERE NOT EXISTS (SELECT 1 FROM nebula.systems WHERE name = 'terrain');

INSERT INTO nebula.systems (name, description)
SELECT 'vision-srv-py', 'Vision LOSM REST API server - FastAPI over losm-store (port 8003, Python)'
WHERE NOT EXISTS (SELECT 1 FROM nebula.systems WHERE name = 'vision-srv-py');
