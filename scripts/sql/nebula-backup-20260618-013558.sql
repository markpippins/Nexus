--
-- PostgreSQL database dump
--

\restrict FMQaugY7feLpnmIOqyZR8u5DrV4RsYpxUrpbWPuwtFc8fb0cB5XeEzKypEx7XQC

-- Dumped from database version 17.10 (Debian 17.10-1.pgdg12+1)
-- Dumped by pg_dump version 17.10 (Debian 17.10-1.pgdg12+1)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Data for Name: systems; Type: TABLE DATA; Schema: nebula; Owner: -
--

INSERT INTO nebula.systems VALUES
	('a1000000-0000-0000-0000-000000000001', 'My Legacy System', 'Migrated from localStorage', '# My Legacy System

This was imported from localStorage.', NULL, '2026-06-16 21:37:36.456339+00'),
	('a1000000-0000-0000-0000-000000000002', 'Second System', 'Another migrated system', 'Second system readme.', NULL, '2026-06-16 21:37:36.456339+00'),
	('fcba6c49-84cb-4012-9540-4350caac22fc', 'TypeScript Services', 'Backend services and utilities in TypeScript', '# TypeScript Codebase

This directory contains the new and actively developed TypeScript code for the project. This is the source of truth for the API.
', '# TypeScript Platform Architecture

Inherits from: `../ARCHITECTURE.md`

## Platform Defaults

| Setting | Value |
|---------|-------|
| node.version | 20 |
| typescript.version | 5.x |
| port.range.backend | 8080-8099 |
| port.range.proxy | 3333-3349 |

## Exceptions

| Project | Setting | Value | Reason |
|---------|---------|-------|--------|
| mock-broker-service | node.version | 18 | Legacy dependency |

## Services

See parent ARCHITECTURE.md for service topology. This file defines platform-level defaults only.
', '2026-06-18 05:04:39.57516+00'),
	('c630e0a3-c280-4a4e-9de8-68f25caf306c', 'Angular Apps', 'Angular frontend applications', NULL, NULL, '2026-06-18 05:06:21.921483+00'),
	('d4ebc25e-5bbf-4250-b39e-3a8024daf531', 'Angular Apps', 'Angular frontend applications', NULL, NULL, '2026-06-18 05:06:39.791995+00'),
	('ad4b676a-0fec-4cce-8c13-4f6ee2980853', 'Angular Apps', 'Angular frontend applications', NULL, NULL, '2026-06-18 05:06:57.919089+00'),
	('3ca9a102-6d27-4a1c-93bc-c04d12515994', 'Angular Apps', 'Angular frontend applications', NULL, NULL, '2026-06-18 05:07:27.526585+00'),
	('924dd171-e407-49ab-8902-570ac8d914a7', 'TypeScript Services', 'Backend services and utilities in TypeScript', '# TypeScript Codebase

This directory contains the new and actively developed TypeScript code for the project. This is the source of truth for the API.
', '# TypeScript Platform Architecture

Inherits from: `../ARCHITECTURE.md`

## Platform Defaults

| Setting | Value |
|---------|-------|
| node.version | 20 |
| typescript.version | 5.x |
| port.range.backend | 8080-8099 |
| port.range.proxy | 3333-3349 |

## Exceptions

| Project | Setting | Value | Reason |
|---------|---------|-------|--------|
| mock-broker-service | node.version | 18 | Legacy dependency |

## Services

See parent ARCHITECTURE.md for service topology. This file defines platform-level defaults only.
', '2026-06-18 05:07:27.842083+00'),
	('4c07b12a-4d50-4bda-bdab-874965226603', 'Python Services', 'Python backend services and pipelines', NULL, NULL, '2026-06-18 05:07:28.279282+00'),
	('4e90827e-9902-4d35-9438-9acc0158224d', 'JVM Services', 'Java/Kotlin service broker and registry implementations', NULL, NULL, '2026-06-18 05:07:28.521992+00'),
	('a18d0460-ffdf-410c-a7f9-d150f302477a', 'Go Services', 'Go-based CCNF and WRP implementations', NULL, NULL, '2026-06-18 05:07:28.921974+00'),
	('534dab1a-5a34-47b4-af1e-8fcefd579423', 'Rust Services', 'Rust-based CCNF verifier', NULL, NULL, '2026-06-18 05:07:28.976484+00'),
	('717e8d19-813b-4bad-9d8c-a849ad147fd2', 'Moleculer Services', 'Moleculer microservices framework projects', '# atomic-moleculer
', NULL, '2026-06-18 05:07:29.035936+00'),
	('b3be6007-7b61-47bb-85f9-335e80d7f50e', 'AdonisJS Services', 'AdonisJS-based broker gateway', NULL, NULL, '2026-06-18 05:07:29.090281+00'),
	('9ae9e43c-5f58-48cc-a008-08533f64c226', 'Tools & Scripts', 'Utility scripts, tools, and agent configurations', '# Nexus Tools — Code Integrity & Governance Tooling

This directory contains the structural integrity tooling for the Nexus
repository: CIR (Code Integrity Runtime) v1 and v2, plus the ARL (Anti-Recursion
Linter).  These tools enforce the CIR-SDM ontology model, detect governance
drift, and patch violations deterministically.

---

## Inventory

| Tool | Location | Purpose | Entry point |
|------|----------|---------|-------------|
| **CIR-1 Scan** | `cir1/scan.py` | Build reference index of pipeline/intent patterns | `python cir1/scan.py` |
| **CIR-1 Lint** | `cir1/lint.py` | CIR-1 through CIR-5 ontology lint engine | `python cir1/lint.py --all` |
| **CIR-1 Patch** | `cir1/patch.py` | Deterministic patch engine (dry-run by default) | `python cir1/patch.py --apply` |
| **CIR v2 ARL** | `arl_linter.py` | 5-pass CIR-SDM structural linter orchestrator | `python arl_linter.py` |
| **ARL classification** | `arl/classification.py` | Map files to CIR-SDM domain labels | imported by `arl_linter.py` |
| **ARL authority** | `arl/authority.py` | Detect lifecycle definitions outside `pgv.state_machine.json` (I7) | imported by `arl_linter.py` |
| **ARL lattice** | `arl/lattice.py` | Enforce forbidden cross-domain keys per CIR-SDM lattice (I8) | imported by `arl_linter.py` |
| **ARL invariants** | `arl/invariants.py` | I1 (recursive wrappers), I2 (state in schema), I3 (cross-layer leak) | imported by `arl_linter.py` |
| **ARL graph** | `arl/graph.py` | Governance dependency graph, cycle detection, forbidden edge classification | imported by `arl_linter.py` |

---

## CIR-1 Suite (`cir1/`)

### cir1/scan.py — Reference Index Builder

Scans the repository with ripgrep for CIR-relevant patterns and writes a
line-numbered reference index.

```
python cir1/scan.py [root-dir] [output-file]
```

Default root is `.`, default output is `cir1_ref_index.txt`.

Patterns searched: `intent_source`, `.pipeline/`, `PIPELINE_`,
`normalize-intent`, `ExecutionState`, `DCO`, `ExecutorRegistry`, `skill_ref`,
`work_request`.

Classification categories: `PIPELINE_PHANTOM`, `DERIVATION_CONTRACT`,
`ASPIRATIONAL_SCHEMA`, `RUNTIME_ASSUMPTION`,
`UNIMPLEMENTED_REGISTRY`, `OTHER`.

### cir1/lint.py — CIR Ontology Lint Engine

Combined structural invariant gate for configuration ontology integrity.
Implements CIR-1 through CIR-5 with the CIR Semantic Domain Model (CIR-SDM)
to scope enforcement by artifact semantic domain and interpretation mode.

**CIR rules:**

| Rule | What it checks |
|------|----------------|
| CIR-1 | Phantom references — `intent_source` pointing to non-existent `.pipeline/` paths |
| CIR-2 | Cross-layer leakage — governance tokens in wrong domains (native-domain exempt) |
| CIR-3 | Implicit execution semantics — `mode`, `retry_policy`, `executor` without `execution_contract` |
| CIR-4 | Static derived state — state keys without `derived_by`/`event_log`/`replay` provenance |
| CIR-5 | Single Canonical Authority — same semantic class key in multiple auth', NULL, '2026-06-18 05:07:29.16024+00'),
	('88e953d0-7fdc-4188-8c9f-ca9737173796', 'Nexus Root', 'Nexus', '# Nexus

A comprehensive polyglot microservices platform featuring broker-based service architecture, service mesh management, and distributed service discovery.

## Overview

The Nexus platform is a distributed system supporting multiple programming languages and frameworks. Built on **Spring Boot 3.5.0** with Java 21, it provides:

- **✅ Service Mesh Management**: Real-time service discovery and visualization via Nexus UI
- **✅ Broker Gateway**: Central hub for request routing and service orchestration  
- **✅ Registry Service Registry**: Persistent service registry with MySQL/H2 storage
- **✅ Polyglot SDKs**: Production-ready client libraries (Python, Node.js, Go)
- **✅ Broker Gateway Proxy**: Advanced reverse proxy with rate limiting and logging
- **✅ External Service Integration**: Seamless integration of services across frameworks
- **✅ 3D Services Mesh View**: Observability layer for real-time monitoring of deployed services.

## Architecture

### **Three-Layer Service Mesh Architecture**

```
┌─────────────────┐     ┌─────────────────────────────┐     ┌──────────────────┐
│  Clients        │────▶│  Broker Gateway Proxy       │────▶│  Broker Gateway  │
│  (Nexus UI,     │     │  (AdonisJS - Port 8080)     │     │  (Spring Boot)   │
│   SDKs, etc.)   │     │  - Rate Limiting            │     │  Port 8081       │
└─────────────────┘     │  - Request Logging          │     └──────────────────┘
                        │  - Host Registration        │              │
                        └─────────────────────────────┘              │
                                  │                                  │
                                  ▼                                  │
                        ┌─────────────────┐                         │
                        │  Registry Service    │◀────────────────────────┘
                        │  (Registry)     │
                        │  Port 8085      │
                        └─────────────────┘
                                  │
                                  ▼
                        ┌─────────────────────────────────────────────┐
                        │           Polyglot Services                 │
                        │  ┌─────────┐ ┌─────────┐ ┌─────────────┐   │', '# Architecture

## System Defaults

| Setting | Value | Notes |
|---------|-------|-------|
| java.version | 21 | Default for all JVM projects |
| spring-boot.version | 3.5.0 | Default Spring Boot version |
| quarkus.version | 3.15.1 | Default Quarkus version |
| helidon.version | 4.x | Default Helidon MP version |
| node.version | 20 | Default Node.js version |
| typescript.version | 5.x | Default TypeScript version |
| python.version | 3.13 | Default Python version |
| port.range.backend | 8080-8099 | Preferred range for backend services |
| port.range.frontend | 3000-3999 | Preferred range for frontend/UI dev servers |
| port.range.proxy | 3333-3349 | Preferred range for proxy services |

## Exceptions

| Project | Setting | Value | Reason |
|---------|---------|-------|--------|
| jvm/helidon/user-access-service | java.version | 17 | Helidon MP compatibility requirement |
| typescript/mock-broker-service | node.version | 18 | Legacy dependency |

## Scope

| Setting | Value |
|---------|-------|
| included_paths | `jvm/**`, `typescript/**` |
| excluded_paths | `jvm/shared/**`, `typescript/utils/**`, `typescript/broker-client/**` |
| enforcement | advisory |

> Enforcement mode: `advisory` = Inspector flags discrepancies only. `strict` = Planner creates remediation plans automatically. Expand scope incrementally as process matures.

## Service Topology

### Three-Layer Service Mesh

1. **Registry Service (Port 8085)**: Central service registry and management
   - Path: `jvm/spring/service-registry/`
   - Framework: Spring Boot
   - Service registration via `/api/registry/register`
   - Framework management (Spring Boot, Quarkus, Helidon, Node.js, Go, Python)
   - Operation-based service discovery
   - Persistent storage (MySQL/H2 fallback)
   - Redis for caching

2. **Broker Gateway (Port 8081 Spring / 8090 Quarkus)**: Request routing and orchestration
   - Spring: `jvm/spring/service-broker/broker-gateway/` (port 8081)
   - Quarkus: `jvm/quarkus/broker-gateway/` (port 8090)
   - ServiceRequest/ServiceResponse protocol
   - Automatic service discovery and routing
   - Load balancing and circuit breaker patterns
   - Health check aggregation

3. **Broker Gateway Proxy (Port 8079 AdonisJS / 3333 TypeScript)**: Public-facing reverse proxy
   - AdonisJS: `adonisjs/broker-gateway-proxy/` (port 8079)
   - TypeScript: `typescript/broker-gateway-proxy/` (port 3333)
   - TypeScript broker-service-proxy: `typescript/broker-service-proxy/` (port 3334)
   - Rate limiting and request logging
   - Auto-registration with host-server
   - Heartbeat mechanism (30-second intervals)
   - Request context headers for tracing

### Service Discovery Flow

1. Service registers with Registry Service (`/api/registry/register`, port 8085)
2. Client requests hit Broker Gateway Proxy (port 8079 AdonisJS or 3333 TypeScript)
3. Proxy forwards to Broker Gateway (port 8081 Spring or 8090 Quarkus) for service lookup
4. Broker Gateway queries Registry Service for service instan', '2026-06-18 05:07:29.338665+00');


--
-- Data for Name: subsystems; Type: TABLE DATA; Schema: nebula; Owner: -
--

INSERT INTO nebula.subsystems VALUES
	('a3000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', 'User Auth', 'Login and registration', '## User Auth Flow

Handles OAuth2 login.', '#10B981', '2026-06-16 21:37:36.456339+00'),
	('a3000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-000000000001', 'Dashboard', 'Main dashboard', NULL, '#3B82F6', '2026-06-16 21:37:36.456339+00'),
	('d7125cf3-fc76-4bbd-83ff-b08b1eb9bd8b', '3ca9a102-6d27-4a1c-93bc-c04d12515994', 'Conduit UI', 'Pipeline management Angular UI', '# Conduit UI — Angular Dashboard

Angular application that renders the conduit pipeline state from the MCP server.
Serves as the visual interface for the work request pipeline.

## Overview

The UI provides a Kanban board showing plans grouped by status columns
(proposed, planning, pending, active, completed, blocked), receipt chains
per plan, and SSE-based live updates. It connects to the Conduit MCP server
at `http://localhost:3100`.

### Features

- **Kanban Board** — Drag-free plan cards grouped by derived status
- **Planner** — Plan creation, editing, promotion, revision, and soft-deletion
- **Sessions Panel** — Real-time active session monitoring with PID, role, and work time
- **Dependency Graph** — Visualize plan dependency relationships
- **Inspection Dashboard** — Browse inspection/blocker reports
- **Analytics Dashboard** — Pipeline metrics (throughput, token usage, cycle times)
- **Prompt Catalog** — Browse captured prompts with lineage tracking
- **Changes View** — Review change reports
- **Archive Browser** — Browse archived plans
- **AI Config** — Manage providers, harnesses, models, and role assignments
- **Agent Status Bar** — Live agent heartbeat monitoring
- **Error Banner** — Global error display with dismissal

## Development Server

```bash
ng serve
```

Navigate to `http://localhost:4400/`. The application automatically reloads
when source files change.

The dev server proxies `/state`, `/tools`, `/events`, `/health`, `/sessions`,
and `/plans/sync` to `http://localhost:3100` (configured in `proxy.conf.json`).

## Building

```bash
ng build
```

Build artifacts go to `dist/`.

## Project Structure

```
src/
├── main.ts
├── app/
│   ├── app.component.ts
│   ├── app.config.ts
│   ├── app.routes.ts
│   ├── services/
│   │   ├── conduit.service.ts     # API client for MCP server
│   │   ├── api-config.ts          # API URL configuration
│   │   ├── types.ts               # Shared types
│   │   ├── ai-config.service.ts   # AI config registry management
│   │   ├── keyboard.service.ts    # Keyboard shortcuts
│   │   ├── toast.service.ts       # Toast notifications
│   │   ├── message-box.service.ts # Modal dialogs
│   │   ├── theme.service.ts       # Dark/light theme
│   │   └── global-error.service.ts # Error handling
│   ├── components/
│   │   ├── kanban-board/           # Main plan board
│   │   ├── plan-card/              # Individual plan card
│   │   ├── planner/                # Plan creation/editing
│   │   ├── sessions/               # Session monitoring
│   │   ├── dependency-graph/       # Plan dependency visualization
│   │   ├── inspection-dashboard/   # Inspection reports
│   │   ├── analytics-dashboard/    # Pipeline analytics
│   │   ├── prompt-catalog/         # Prompt ', '#EF4444', '2026-06-18 05:07:27.558+00'),
	('5f0b29b3-38da-4797-8573-c5e7b2ef1a20', '3ca9a102-6d27-4a1c-93bc-c04d12515994', 'Nebula UI', 'RMS Angular application', '
# Nebula RMS (Requirements Management System)

A high-performance, hierarchical Requirements Management System built with Angular and AI capabilities. Nebula RMS allows teams to structure projects into Systems, Subsystems, and Features, manage requirements via a Kanban board, and leverage Google''s Gemini AI to decompose user stories into technical tasks automatically.

## 🚀 Features

### 🏗 Hierarchical Project Management
- **Three-level Structure**: Organize work into **Systems** → **Subsystems** → **Features**.
- **Contextual Documentation**: Maintain specific `README` documentation for every level of the hierarchy to track architecture and decisions.

### 📋 Requirements Management
- **Kanban Board**: Drag-and-drop interface to manage requirement status (Backlog, ToDo, InProgress, Done).
- **Table View**: Sortable, list-based view for quick editing and bulk review.
- **CRUD Operations**: Create, Read, Update, and Delete requirements with priority levels (Low, Medium, High).

### 🤖 AI-Powered Decomposition
- **Context-Aware Generation**: Uses the documentation from the current System/Subsystem/Feature to generate technically relevant requirements.
- **User Story to Tasks**: Converts high-level user stories into granular technical requirements using the **Gemini 2.5 Flash** model.

### 🎨 UX & Theming
- **Dark Mode**: Fully supported dark/light theme toggle.
- **Responsive Design**: Built with Tailwind CSS for a clean, modern interface.
- **Local Persistence**: All data and preferences are saved automatically to the browser''s `localStorage`.

## 🛠 Tech Stack

- **Framework**: Angular v21+ (Zoneless, Signals, Standalone Components)
- **Styling**: Tailwind CSS
- **AI Integration**: Google GenAI SDK (`@google/genai`)
- **State Management**: Angular Signals & Computed properties
- **Build/Env**: Standard Angular Environment configuration

## ⚙️ Configuration & Setup

### API Key Configuration

To use the AI generation features, a Google Gemini API key is required.

**Option 1: Environment Variable (Deployment)**
If deploying, you can inject the API key into the `process.env` polyfill in `index.html` or replace the environment files during build.
- The app looks for `process.env.API_KEY`.

**Option 2: UI Input (Local/Session)**
1. Open the application.
2. Click the **"Setup AI"** button in the top right toolbar.
3. Enter your Gemini API Key.
4. The key is stored in memory for the current session.

### Running the Application

This project is designed as a standalone Angular application.

1. **Install Dependencies**:
   Ensure you have the necessary node modules if running locally with a build tool, or serve the files via a static server if using the CDN-based setup provided in the applet.

2. **Start**:
   Serve the application using your preferred web server.

## 📂 Project Structure

- `src/components/`: Standalone Angular components (Board, Table, Nav, etc.).
- `src/services/`: Singleton services for Data (State) and AI i', '#F97316', '2026-06-18 05:07:27.596448+00'),
	('78a9e069-f2de-4e2c-888c-d647d133510f', '3ca9a102-6d27-4a1c-93bc-c04d12515994', 'Nexus Console', 'Main developer console', '# Nexus - Service Mesh Management Console

Nexus is a specialized administration console built with Angular for managing the Atomic Service Mesh. It provides a comprehensive interface for overseeing services, host servers, deployments, and configurations across the infrastructure.

## Key Capabilities

- **Service Mesh Management:** View and manage the registry of all services (`atomic-services`, `atomic-users`, etc.), their versions, and statuses.
- **Infrastructure Control:** Monitor and configure Host Servers (physical/virtual nodes) and Broker Gateways.
- **Deployment Tracking:** Track active deployments and rollout history across different environments.
- **Configuration Management:** Centralized management of service configurations and feature flags.
- **Visual Architecture Graph:** Interactive 3D visualization of service dependencies and relationships.
- **Multi-Platform Management:** Unified interface for managing services, frameworks, deployments, and hosts.
- **Integrated Search & Discovery:** Multi-source search capabilities with web, image, video, academic, and AI results.
- **Real-time Monitoring:** Live service health and status updates with WebSocket integration.

## Architecture & Features

- **Modern Angular:** Built with Angular 20+, utilizing Standalone Components, Signals, and Zoneless Change Detection for optimal performance.
- **Remote Management:** Connects to backend APIs to fetch real-time state of the mesh.
- **Dual Pane Interface:** Efficiently manage resources with a split-view interface for comparing configs or logs.
- **Theming:** Integrated Light, Steel, and Dark themes.
- **Visual Component Editor:** Integrated 3D service architecture graph with visual component editor.
- **Platform Management Views:** Dedicated CRUD interfaces for services, frameworks, deployments, hosts, and lookup tables.
- **Integrated Chat & Notes:** Built-in chat functionality and note-taking capabilities.
- **RSS Feed Integration:** Real-time feed monitoring and display.
- **Terminal Emulator:** Integrated terminal for command-line operations.
- **Advanced Search:** Multi-source search with Google, Unsplash, YouTube, academic databases, and Gemini AI.

## Recent Feature Updates

### Service Mesh Visualization
- **3D Architecture Graph:** Interactive visualization of service dependencies using Three.js
- **Real-time Updates:** WebSocket integration for live service status updates
- **Visual Component Editor:** Create and modify service components with visual tools
- **Service Instance Management:** Detailed view and control of individual service instances

### Platform Management
- **Data Dictionary:** Organized management of frameworks, service types, server types, and categories
- **CRUD Operations:** Full create, read, update, delete capabilities for all platform entities
- **Visual Style Management:** Associate default and override visual styles with services and service types
- **Deployment Management:** Track and manage service deployme', '#F59E0B', '2026-06-18 05:07:27.634176+00'),
	('d54a9911-b16d-4ea6-ac23-8c3600cdd223', '3ca9a102-6d27-4a1c-93bc-c04d12515994', 'Duality UI', 'Dual-pane interface', '<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/abebe916-f995-4034-8a0f-bf68ca438f1f

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`
', '#10B981', '2026-06-18 05:07:27.666591+00'),
	('af45c2f0-554f-4e06-9ae9-b0b819baff8f', '3ca9a102-6d27-4a1c-93bc-c04d12515994', 'Plurality UI', 'Multi-agent view', '<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/8b3600bb-05d1-4a01-9415-61d871a3eea3

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`
', '#06B6D4', '2026-06-18 05:07:27.701857+00'),
	('700182c4-c747-44a1-ba3c-9b2771d86056', '3ca9a102-6d27-4a1c-93bc-c04d12515994', 'Nexus Orb', 'Orb visualization component', '# NexusAvatar1

This project was generated using [Angular CLI](https://github.com/angular/angular-cli) version 21.2.13.

## Development server

To start a local development server, run:

```bash
ng serve
```

Once the server is running, open your browser and navigate to `http://localhost:4200/`. The application will automatically reload whenever you modify any of the source files.

## Code scaffolding

Angular CLI includes powerful code scaffolding tools. To generate a new component, run:

```bash
ng generate component component-name
```

For a complete list of available schematics (such as `components`, `directives`, or `pipes`), run:

```bash
ng generate --help
```

## Building

To build the project run:

```bash
ng build
```

This will compile your project and store the build artifacts in the `dist/` directory. By default, the production build optimizes your application for performance and speed.

## Running unit tests

To execute unit tests with the [Vitest](https://vitest.dev/) test runner, use the following command:

```bash
ng test
```

## Running end-to-end tests

For end-to-end (e2e) testing, run:

```bash
ng e2e
```

Angular CLI does not come with an end-to-end testing framework by default. You can choose one that suits your needs.

## Additional Resources

For more information on using the Angular CLI, including detailed command references, visit the [Angular CLI Overview and Command Reference](https://angular.dev/tools/cli) page.
', '#3B82F6', '2026-06-18 05:07:27.73769+00'),
	('f3fe8eff-5a76-47da-8913-cc8f143da6f8', '3ca9a102-6d27-4a1c-93bc-c04d12515994', 'Prompt Architect', 'Prompt crafting interface', '# Prompt Architect

Prompt Architect is a specialized tool designed to help developers and architects generate structured, high-fidelity JSON prompts for Large Language Models (LLMs). By providing a formal specification of a system''s context, requirements, UI, data model, and behavior, Prompt Architect ensures that LLMs have all the necessary information to generate accurate boilerplate code, system designs, or technical documentation.

## User Interface Overview

The interface is divided into two main panels:
1.  **Form Panel (Left):** A series of collapsible sections where you define the system specification.
2.  **Preview Panel (Right):** A real-time JSON preview of the generated prompt, which can be copied directly to your clipboard.

### Key Features
-   **Real-time Sync:** Every change in the form is immediately reflected in the JSON preview.
-   **Section Toggles:** Every section can be enabled or disabled. Disabling a section sets its value to `null` in the JSON, allowing you to omit irrelevant parts of the specification.
-   **Dynamic Lists:** Add and remove items (technologies, requirements, test cases, etc.) with ease.
-   **Copy to Clipboard:** One-click copying of the entire JSON structure.

---

## How to Use

1.  **Define Context:** Start by naming your project and defining the AI''s role (e.g., "Senior React Architect").
2.  **Specify Requirements:** List the technologies to use and core requirements the system must ensure.
3.  **Design the UI:** Define the theme, layout, and specific UI elements (buttons, forms, etc.) and their data bindings.
4.  **Model Data:** Describe the storage type and define your data collections or tables.
5.  **Define Logic:** List state changes, validation rules, and edge cases.
6.  **Quality Control:** Add test cases and error handling strategies.
7.  **Contracts:** (Optional) Enable TypeSpec to define formal API or data contracts.
8.  **Configure Output:** Specify what artifacts you want the LLM to generate (e.g., "React Components", "Unit Tests").
9.  **Copy & Prompt:** Copy the generated JSON and paste it into your LLM of choice (Gemini, ChatGPT, etc.) as a system instruction or part of your prompt.

---

## Section Details & JSON Mapping

### 1. Project Context
-   **Purpose:** Sets the high-level goals and technical assumptions.
-   **JSON Node:** `context`
-   **Fields:**
    -   `project`: Project name.
    -   `description`: Core functionality and goals.
    -   `agent_role`: The persona the AI should adopt.
    -   `assume`: Technical environment (OS, Browser, Framework).

### 2. Requirements
-   **Purpose:** Explicit constraints and technology choices.
-   **JSON Node:** `requirements`
-   **Fields:**
    -   `use`: List of technologies/libraries.
    -   `ensure`: Core requirements to satisfy.
    -   `separate`: (Internal) Logic for separation of concerns.

### 3. UI & Styling
-   **Purpose:** Defines the visual and structural aspects of the frontend.
-   **JSON Node:** `ui_spec`
-   **Field', '#6366F1', '2026-06-18 05:07:27.774804+00'),
	('4a8d1658-8448-4e19-af3e-5c3286188b23', '4e90827e-9902-4d35-9438-9acc0158224d', 'Spring Service Broker', 'Spring-based service broker', '#  client library for Java

 client library for Java.

This package contains  client library.

## Getting started

### Prerequisites

- [Java Development Kit (JDK)][jdk] with version 8 or above

### Adding the package to your product

```xml
<dependency>
    <groupId>io.clientcore</groupId>
    <artifactId>client</artifactId>
    <version>1.0.0-beta.1</version>
</dependency>
```

<!-- LINKS -->
[jdk]: https://learn.microsoft.com/azure/developer/java/fundamentals/
', '#EF4444', '2026-06-18 05:07:28.546823+00'),
	('a183b68d-e694-4bd6-a6b6-db46a0e22a5c', '924dd171-e407-49ab-8902-570ac8d914a7', 'Conduit MCP', 'MCP server with SSE and watcher', '# Conduit MCP

MCP server and SSE event bus for the pipeline system. Runs on port 3100
and provides the API surface for `conduit-ui` and `conduit`.

**Receipt-first authority:** Every plan operation goes through an MCP tool that
issues a receipt. Writing `.md` files directly to `nexus/graph/IMPLEMENTATION_PLANS/` is
an anti-pattern — the plan will have no `derived_status` and will be invisible.

The MCP server is the sole schema authority for the shared SQLite database.
It owns migrations for the `plans`, `receipts`, `sessions`, `tickets`,
`circuit_breaker`, and AI config tables. The Python conduit validates required
columns on startup and fails fast if the MCP server hasn''t run migrations.

## Quick Start

```bash
# 1. Copy and edit the environment file
cp .env.example .env

# 2. Install dependencies
npm install

# 3. Start the server
npx tsx src/index.ts
```

## Creating Plans

Always use MCP tools, never write files directly:

```bash
# Capture an idea (goes to proposed/, issues PROPOSED receipt)
curl -X POST http://localhost:3100/tools/call \
  -H ''Content-Type: application/json'' \
  -d ''{"name":"create_proposed_plan","arguments":{"title":"My feature"}}''

# Create directly into implementation (goes to pending/, issues PLAN_CREATE)
curl -X POST http://localhost:3100/tools/call \
  -H ''Content-Type: application/json'' \
  -d ''{"name":"create_plan","arguments":{"title":"My feature"}}''
```

## Environment

All paths are read from `.env` (or environment variables). See `.env.example`
for the complete list.

| Variable       | Default              | Purpose                           |
|----------------|----------------------|-----------------------------------|
| `PIPELINE_DIR` | `../../nexus/.conduit-data` | Root of the conduit data directory |
| `PORT`         | `3100`               | HTTP server port                  |

The `.env` loader lives in `src/env.ts` — a shared module. No `dotenv` dependency.

## Key Tools

| Tool | Receipt | Description |
|------|---------|-------------|
| `create_proposed_plan` | `PROPOSED` | Capture an idea |
| `create_plan` | `PLAN_CREATE` | Create directly into pending |
| `promote_plan` | `PLANNING` | Promote proposed → planning |
| `revise_plan` | `PLANNING` | Copy completed/blocked for revision |
| `update_plan` | — | Edit plan metadata (title, goal, files, criteria, deps) |
| `delete_plan` | — | Soft-delete (marks deleted=1 in DB) |
| `issue_receipt` | Any | Manually record a pipeline event |
| `get_plan_receipts` | — | View receipt chain |
| `query_pipeline_state` | — | Full state JSON |
| `query_inspections` | — | Search/filter inspection reports |
| `query_prompts` | — | Search captured prompts with lineage |
| `query_changes` | — | Search change reports |
| `query_analytics` | — | Pipeline metrics |
| `save_prompt` | — | Persist a prompt to the audit trail |
| `agent_heartbeat` | — | Agent liveness ping |
| `agent_finished` | — | Agent completion signal |
| `seed_ai_config` | — ', '#EF4444', '2026-06-18 05:07:27.886489+00'),
	('c71e2dc0-cec9-48e1-b332-b66a27e22dbd', '924dd171-e407-49ab-8902-570ac8d914a7', 'Nebula SRV', 'RMS Express API server', NULL, '#F97316', '2026-06-18 05:07:27.936301+00'),
	('e41db75a-d4b9-4e01-aaea-1b6e7f8676b5', '924dd171-e407-49ab-8902-570ac8d914a7', 'Broker Client', 'Service broker client library', '# Nexus Broker Gateway Node.js SDK

Lightweight Node.js client for interacting with Nexus Broker Gateway services.

## Installation

```bash
npm install axios
```

## Quick Start

```javascript
const { createClient, ServiceDetails } = require(''./nexus_broker_sdk'');

// Create client
const client = createClient({
    gatewayUrl: ''http://localhost:8080'',
    hostServerUrl: ''http://localhost:8085''
});

// Example: Register a service
const service = new ServiceDetails({
    serviceName: ''nodejs-microservice'',
    endpoint: ''http://localhost:3002'',
    healthCheck: ''health'',
    framework: ''Express''
});

(async () => {
    const success = await client.registerService(service);
    if (success) {
        console.log(''Service registered successfully!'');
    } else {
        console.log(''Service registration failed'');
    }
})();

// Example: Invoke a service operation
(async () => {
    const response = await client.invokeOperation(
        ''getUserRegistrationForToken'',
        { token: ''sample-token-123'' }
    );

    if (response.success) {
        console.log(''Success:'', response.data);
    } else {
        console.error(''Error:'', response.errors);
    }
})();

// Example: Check service health
(async () => {
    const isHealthy = await client.healthCheck(''loginService'');
    console.log(`Login service healthy: ${isHealthy}`);
})();
```

## API Reference

### BrokerGatewayClient

Main client class for interacting with the broker gateway.

#### Constructor

```javascript
new BrokerGatewayClient(options)
```

**Options:**
- `gatewayUrl`: URL of the broker gateway (default: "http://localhost:8080")
- `hostServerUrl`: URL of the host server for service discovery (default: "http://localhost:8085")

### Methods

##### async discoverService(operation) → Promise<ServiceDetails|null>

Find a service that can handle the specified operation.

**Parameters:**
- `operation`: Operation name (e.g., "getUserRegistrationForToken")

**Returns:** `ServiceDetails` if found, `null` otherwise

```javascript
const service = await client.discoverService(''getUserRegistrationForToken'');
if (service) {
    console.log(`Found service: ${service.serviceName} at ${service.endpoint}`);
}
```

##### async getServiceDetails(serviceName) → Promise<ServiceDetails|null>

Get detailed information about a specific service.

**Parameters:**
- `serviceName`: Name of the service

**Returns:** `ServiceDetails` if found, `null` otherwise

```javascript
const details = await client.getServiceDetails(''loginService'');
if (details) {
    console.log(`Service endpoint: ${details.endpoint}`);
}
```

##### async invokeOperation(operation, params, serviceName) → Promise<BrokerResponse>

Invoke an operation on a service through the broker gateway.

**Parameters:**
- `operation`: Operation name to invoke
- `params`: Parameters for the operation
- `serviceName`: Optional service name (discovered if not provided)

**Returns:** `BrokerResponse` with operation results

```javascript
const response = ', '#F59E0B', '2026-06-18 05:07:27.989037+00'),
	('006af808-9a55-4060-ac83-b4d93bba83d2', '924dd171-e407-49ab-8902-570ac8d914a7', 'Broker Gateway Proxy', 'Gateway proxy service', '# Broker Service Proxy

A TypeScript-based proxy server that forwards requests to the broker gateway service. This proxy acts as an intermediary between clients and the broker gateway, providing a unified interface for service requests.

## Overview

The Broker Service Proxy receives requests in the same format as the broker gateway and forwards them to the actual broker gateway service. It maintains the same API contract, making it transparent to clients.

## Features

- **Transparent Proxying**: Forwards requests to the broker gateway while maintaining the same API contract
- **Configuration**: Supports configuration of listening port and broker gateway URL via environment variables
- **Error Handling**: Properly handles and forwards error responses from the broker gateway
- **Health Check**: Provides a health check endpoint at `/health`

## API Endpoints

- `POST /api/broker/submitRequest` - Proxies requests to the broker gateway
- `GET /health` - Health check endpoint

## Environment Variables

- `BROKER_PROXY_PORT` - Port for the proxy server to listen on (default: 3333)
- `HOST` - Host for the proxy server to bind to (default: 0.0.0.0)
- `BROKER_GATEWAY_URL` - URL of the broker gateway to forward requests to (default: http://localhost:8080)

## Usage

### Development

```bash
npm run dev
```

### Production

```bash
npm run build
npm start
```

## Configuration

Create a `.env` file based on `.env.example` to configure your environment variables:

```bash
cp .env.example .env
```

Then modify the values in `.env` to match your setup.

## Request Format

The proxy expects requests in the same format as the broker gateway:

```json
{
  "service": "user-service",
  "operation": "getUser",
  "params": {
    "id": "123"
  },
  "requestId": "unique-request-id"
}
```

## Architecture

```
Client -> Proxy Server -> Broker Gateway -> Backend Services
```', '#10B981', '2026-06-18 05:07:28.034263+00'),
	('9b7d1e67-82d3-4d71-b784-e99f772710dd', '924dd171-e407-49ab-8902-570ac8d914a7', 'Broker Service Proxy', 'Service proxy layer', '# Broker Service Proxy

A TypeScript-based proxy server that forwards requests to the broker gateway service. This proxy acts as an intermediary between clients and the broker gateway, providing a unified interface for service requests.

## Overview

The Broker Service Proxy receives requests in the same format as the broker gateway and forwards them to the actual broker gateway service. It maintains the same API contract, making it transparent to clients.

## Features

- **Transparent Proxying**: Forwards requests to the broker gateway while maintaining the same API contract
- **Configuration**: Supports configuration of listening port and broker gateway URL via environment variables
- **Error Handling**: Properly handles and forwards error responses from the broker gateway
- **Health Check**: Provides a health check endpoint at `/health`

## API Endpoints

- `POST /api/broker/submitRequest` - Proxies requests to the broker gateway
- `GET /health` - Health check endpoint

## Environment Variables

- `BROKER_PROXY_PORT` - Port for the proxy server to listen on (default: 3333)
- `HOST` - Host for the proxy server to bind to (default: 0.0.0.0)
- `BROKER_GATEWAY_URL` - URL of the broker gateway to forward requests to (default: http://localhost:8080)

## Usage

### Development

```bash
npm run dev
```

### Production

```bash
npm run build
npm start
```

## Configuration

Create a `.env` file based on `.env.example` to configure your environment variables:

```bash
cp .env.example .env
```

Then modify the values in `.env` to match your setup.

## Request Format

The proxy expects requests in the same format as the broker gateway:

```json
{
  "service": "user-service",
  "operation": "getUser",
  "params": {
    "id": "123"
  },
  "requestId": "unique-request-id"
}
```

## Architecture

```
Client -> Proxy Server -> Broker Gateway -> Backend Services
```', '#06B6D4', '2026-06-18 05:07:28.076473+00'),
	('f1d2d363-2a48-4fbe-9237-b79494e7c47d', '924dd171-e407-49ab-8902-570ac8d914a7', 'File System Server', 'Virtual filesystem service', '# File System Server - Complete Test Suite

This directory contains a comprehensive test suite for the file-system-server.

## Files

- `fs-serv.ts` - File system server (ESM, bun-compatible)
- `test-fs-server.ts` - Main test suite covering all core operations
- `test-copy.ts` - Specific test for copy operation with setup/teardown
- `start.sh` - Server startup script (respects `FS_ROOT_DIR` env var)
- `run-tests.sh` - Script to run all tests under bun

## Operations Tested

All operations passing:
- Health check (`/health` endpoint)
- List directory (`ls` operation)
- Create directory (`mkdir` operation)
- Create file (`newfile` operation)
- Delete file (`deletefile` operation)
- Delete directory (`rmdir` operation)
- Rename file/directory (`rename` operation)
- Check file existence (`hasfile` operation)
- Check folder existence (`hasfolder` operation)
- Move file/directory (`move` operation) - includes EXDEV fallback
- Copy file/directory (`copy` operation)

## Running Tests

```bash
cd nexus/typescript/file-system-server
bash run-tests.sh
```

## Server Requirements

- bun runtime
- Port 4040 available
- `FS_ROOT_DIR` env var (optional, defaults to `fs_root/`)

## Starting the Server

```bash
bash start.sh                    # uses fs_root/ by default
FS_ROOT_DIR=/custom/path bash start.sh  # custom root
```
', '#3B82F6', '2026-06-18 05:07:28.119694+00'),
	('4c9312df-89ab-4dec-a914-87a663f4a2c9', '924dd171-e407-49ab-8902-570ac8d914a7', 'Image Server', 'Image processing service', NULL, '#6366F1', '2026-06-18 05:07:28.150589+00'),
	('d4e2f9c5-fa42-41a1-9bc5-12f76e77a1f2', '924dd171-e407-49ab-8902-570ac8d914a7', 'Mock Broker Service', 'Mock broker for testing', '# Mock Service Broker

This is a mock implementation of the Spring Boot Service Broker API that your frontend applications expect.

## Purpose

The react-ts-servicebroker (and other servicebroker apps) require a backend API running on port 8080. This mock server provides that API for development purposes.

## Quick Start

1. **Install dependencies:**
   ```bash
   cd mock-service-broker
   npm install
   ```

2. **Start the server:**
   ```bash
   npm start
   ```

3. **Verify it''s running:**
   Open http://localhost:8080/health in your browser

## API Endpoints

### POST /api/broker/submitRequest
Accepts service broker requests with the following format:
```json
{
  "service": "userService",
  "operation": "getById",
  "params": {"id": 1},
  "requestId": "client-123456"
}
```

### Supported Operations

**userService:**
- `getById` - Get user by ID: `{"id": 1}`
- `create` - Create new user: `{"user": {"name": "John", "email": "john@example.com"}}`
- `list` - Get all users: `{}`

### Response Format
```json
{
  "ok": true,
  "data": {...},
  "errors": [],
  "requestId": "client-123456", 
  "ts": "2025-09-28T..."
}
```

## Mock Data

The server starts with 2 sample users:
- ID 1: John Doe (john@example.com)
- ID 2: Jane Smith (jane@example.com)

New users will be assigned incrementing IDs starting from 3.

## CORS

CORS is enabled for all origins to support frontend development.# Mock Service Broker

This is a mock implementation of the Spring Boot Service Broker API that your frontend applications expect.

## Purpose

The react-ts-servicebroker (and other servicebroker apps) require a backend API running on port 8080. This mock server provides that API for development purposes.

## Quick Start

1. **Install dependencies:**
   ```bash
   cd mock-service-broker
   npm install
   ```

2. **Start the server:**
   ```bash
   npm start
   ```

3. **Verify it''s running:**
   Open http://localhost:8080/health in your browser

## API Endpoints

### POST /api/broker/submitRequest
Accepts service broker requests with the following format:
```json
{
  "service": "userService",
  "operation": "getById",
  "params": {"id": 1},
  "requestId": "client-123456"
}
```

### Supported Operations

**userService:**
- `getById` - Get user by ID: `{"id": 1}`
- `create` - Create new user: `{"user": {"name": "John", "email": "john@example.com"}}`
- `list` - Get all users: `{}`

### Response Format
```json
{
  "ok": true,
  "data": {...},
  "errors": [],
  "requestId": "client-123456", 
  "ts": "2025-09-28T..."
}
```

## Mock Data

The server starts with 2 sample users:
- ID 1: John Doe (john@example.com)
- ID 2: Jane Smith (jane@example.com)

New users will be assigned incrementing IDs starting from 3.

## CORS

CORS is enabled for all origins to support frontend development.', '#8B5CF6', '2026-06-18 05:07:28.187451+00'),
	('495c8ae2-3621-41e6-aec0-ccc2213d0671', '924dd171-e407-49ab-8902-570ac8d914a7', 'Unsplash', 'Unsplash image integration', NULL, '#EC4899', '2026-06-18 05:07:28.218526+00'),
	('b09fa905-8087-4387-98f0-3dff717bcaf0', '924dd171-e407-49ab-8902-570ac8d914a7', 'Google Integration', 'Google services integration', NULL, '#F43F5E', '2026-06-18 05:07:28.248636+00'),
	('0331c3c4-e172-4b82-9500-e7d5a156ca98', '4c07b12a-4d50-4bda-bdab-874965226603', 'Cascade', 'NATS-based event pipeline orchestrator', '# Event Pipeline — System of Record for Thought

## Purpose

The Event Pipeline converts system activity into **history**.

It is the backbone that allows the platform to answer:

> What happened?
> When did it happen?
> Why did the system change?

Rather than storing mutable state directly,
the architecture records **events** from which state emerges.

---

## Core Idea

State is temporary.

Events are permanent.

The system does not primarily store objects —
it stores **transitions**.

---

## Architectural Philosophy

### 1. Event First, State Second

Traditional systems:


Event Pipeline:


This inversion enables:

- reproducibility
- replayability
- auditability
- temporal reasoning

---

### 2. History as a First-Class Primitive

Every change becomes part of an irreversible timeline.

Nothing is silently replaced.

Instead:

- corrections become new events
- conflicts become observable
- learning becomes traceable

The system remembers *how it arrived* somewhere.

---

### 3. Append-Only Reality

Events are never modified.

They may be:

- superseded
- reconciled
- interpreted differently

—but never erased.

This mirrors real cognition:

memory evolves through reinterpretation, not deletion.

---

### 4. Decoupling Producers and Consumers

Any subsystem may emit events.

No subsystem owns the global state.

The pipeline acts as:

- mediator
- historian
- synchronization layer

Producers do not need to know who consumes their events.

Consumers do not need to know who created them.

---

### 5. Temporal Intelligence

The pipeline enables reasoning across time:

- trajectory analysis
- conflict detection
- convergence/divergence tracking
- reflection and reconciliation

Without events, higher cognition cannot exist.

---

## Mental Model

The Event Pipeline is:

- a nervous system
- a black box flight recorder
- a distributed memory stream

If the system were restarted from zero,
replaying events would rebuild its understanding.

---

## Conceptual Flow

### 1. Event Emission

Subsystems produce structured descriptions of change.

Examples of conceptual events:

- knowledge discovered
- relationship inferred
- correction applied
- observation made

Events describe **what changed**, not current truth.

---

### 2. Validation

The pipeline ensures events are:

- structurally valid
- temporally coherent
- attributable to a source

Validation protects historical integrity.

---

### 3. Sequencing

Events are ordered into a timeline.

Ordering provides causality.

Without ordering, meaning cannot accumulate.

---

### 4. Distribution

Events become available to:

- projections
- reducers
- analytics
- cognitive engines

The pipeline itself does not interpret events.

It guarantees their availability.

---

### 5. Projection (Derived State)

State emerges from eve', '#EF4444', '2026-06-18 05:07:28.30204+00'),
	('ed47715d-5f58-4062-b43e-085275cfa8a9', '4c07b12a-4d50-4bda-bdab-874965226603', 'Conduit (Legacy)', 'Legacy Python conduit service', '# Conduit

Cron-driven orchestrator that consumes the `nexus/.conduit-data/pipeline.db` SQLite
database and dispatches WorkRequests to AI executors (opencode, ollama).

**Receipt-first architecture:** Plan state is determined exclusively by the
receipt chain, not filesystem location. Always use MCP tools or the conduit-ui
Angular dashboard to create plans — writing `.md` files directly to
`IMPLEMENTATION_PLANS/` will produce invisible, orphaned plans.

**Rate-limit resilience:** When the executor hits a rate limit, the pipeline
retries in place (5 retries, 5-minute delay each). The ticket stays claimed
and the circuit breaker is not tripped. Only actual execution time counts
toward session staleness — waiting time is excluded.

## Quick Start

```bash
# 1. Copy and edit the environment file
cp .env.example .env
# Edit .env if your paths differ from the defaults

# 2. Check status (no lock required, read-only)
python3 main.py --status

# 3. Run the full pipeline (acquires lock, processes all roles)
python3 main.py --all
```

## Plan Lifecycle

```
Propose → Promote → Plan → Build → Review

1. Capture an idea     create_proposed_plan  → PROPOSED receipt, file in proposed/
2. Promote to planning  promote_plan          → PLANNING receipt, file in planning/
3. Planner elucidates   (cron: planner role)   → PLAN_CREATE receipt, file in pending/
4. Builder implements   (cron: builder role)   → IMPLEMENTATION receipt, file in active/
5. Reviewer approves    (cron: reviewer role)  → REVIEW_PASS receipt, file in completed/
```

For the full architecture, receipt state machine, and anti-patterns, see
[ARCHITECTURE.md](./ARCHITECTURE.md).

## Environment

All paths are read from `.env` (or environment variables). See `.env.example`
for the complete list.

| Variable                    | Default                                                    | Purpose                                |
|----------------------------|------------------------------------------------------------|----------------------------------------|
| `PIPELINE_DB_PATH`         | `/home/codex/dev/nexus/.conduit-data/pipeline.db`          | SQLite database                        |
| `PIPELINE_LOCK_PATH`       | `/tmp/pipeline-manager.lock`                               | Prevents concurrent runs               |
| `PIPELINE_DCO_DIR`         | `/home/codex/dev/nexus/.conduit-data/WORK_REQUESTS`        | DCO output directory                   |
| `PIPELINE_ROOT`            | (derived from DB path)                                     | Project root for executor artifacts    |
| `OPENCODE_BIN`             | `/home/codex/.opencode/bin/opencode`                       | Path to the opencode binary            |
| `PIPELINE_EXECUTOR_TIMEOUT`| `1800`                                                     | Subprocess timeout in seconds          |
| `PIPELINE_WATCHDOG_STALE`  | `1800`                                                     | Max cumulative work seconds before stale kill |
', '#F97316', '2026-06-18 05:07:28.3382+00'),
	('02d77447-ea0a-4ba3-a65f-7960f98c414a', '4c07b12a-4d50-4bda-bdab-874965226603', 'HTML Importer', 'Chat transcript ingestion pipeline', '# HTML & Markdown Chat Transcript Importer

Extracts individual messages from saved HTML and Markdown chat transcripts and
normalizes them into a consistent format.

## Supported sources

| Source | Status |
|---|---|
| ChatGPT (including custom GPTs) | ✅ |
| Microsoft Copilot | ✅ |
| Markdown chat exports | ✅ (heuristic — catches short acknowledgments) |
| Google Gemini | Stub — awaiting a real Gemini chat export sample |
| Google Search AI mode | Stub — awaiting parser implementation |

Adding a new source requires only a single subclass — see **Extending** below.

## Setup

```bash
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

Or just run `main.py` directly — it auto-installs dependencies on first use.

## Usage

### Console output (human-readable, truncated for display)

```bash
python main.py path/to/chat.html
python main.py path/to/conversation.md
python main.py path/to/folder/
```

Each `NormalizedMessage` is printed with text and CSS selector refs truncated to ~120 chars. Full data is always available via `msg.text`, `msg.raw_html_ref`, and `msg.to_dict()`.

### JSON output (complete, machine-readable)

```bash
# JSON to stdout
python main.py path/to/folder/ --json

# JSON to file (status messages go to stderr)
python main.py path/to/folder/ --json -o output.json
```

The JSON output includes all messages with full text, full HTML refs, metadata, and timestamp provenance.

## Data model

### NormalizedMessage

```python
NormalizedMessage {
    message_id: str          # Unique ID from source HTML (or CSS selector fallback)
    speaker: str             # "user" or "assistant"
    timestamp: TimestampInfo # See below
    text: str                # Full extracted message text
    turn_index: int          # 0-based turn (user + assistant share same turn)
    raw_html_ref: str        # CSS selector path for traceability
}
```

### TimestampInfo

```python
TimestampInfo {
    value: str | None        # ISO 8601 timestamp, or None
    confidence: "high"       # Found in DOM on the message element
                | "medium"   # Found in embedded JSON (e.g. create_time)
                | "low"      # Derived from file modification time
                | "none"     # Not available
    source: "dom" | "embedded_json" | "file_metadata" | "synthetic"
    raw_value: str | None    # Original unmodified value, if any
}
```

### ConversationMetadata (extracted once per file)

```python
ConversationMetadata {
    conversation_id: str | None
    title: str | None
    create_time: str | None
    update_time: str | None
    model: str | None          # e.g. "gpt-5-mini", "gpt-5-3"
    export_source: str | None  # e.g. "ChatGPT", "Microsoft Copilot"
}
```

## Output examples

### Console

```
--------------------------------------------------------------------------------
[Turn 0] user (2026-04-10T02:06:50+00:00 (low, from file_metadata))
  ID: d7f5ec8b-7d71-4440-9925-c115f90c23da
  Ref: #main > #thread > di', '#F59E0B', '2026-06-18 05:07:28.377566+00'),
	('efc7dd33-add8-4e1e-992e-7d9b8945a0de', '4c07b12a-4d50-4bda-bdab-874965226603', 'FS Crawler', 'Filesystem crawler and watcher', '# Media Metadata Service v2.0

A modern, containerized media file metadata indexing service built with Docker, Redis, MongoDB, and MySQL. This is a complete rewrite of the legacy media_hound system with improved reliability, performance, and maintainability.

## Key Features

- **Resumable Scanning**: Network/power interruption resistant with Redis-based state persistence
- **Multi-format Support**: Audio (MP3, FLAC, etc.), Video (MP4, MKV, etc.), Images (JPEG, PNG, etc.), Documents
- **Duplicate Detection**: Advanced duplicate detection using audio fingerprints and content hashing
- **Quality Assessment**: Automatic quality scoring based on format, bitrate, and sample rate
- **Smart Deletion Rules**: Path-based preferences (albums > compilations > misc) with configurable rules
- **Flexible Metadata Storage**: MongoDB for scalable, schema-flexible metadata storage
- **Async Processing**: Modern Python async/await for better performance
- **Docker-based**: Easy deployment and scaling
- **REST API**: Full API for querying and managing the system

## Architecture

- **FastAPI**: Modern async web framework
- **Redis**: State persistence and caching
- **MongoDB**: Flexible metadata document storage
- **MySQL**: Configuration and library management
- **Docker Compose**: Orchestrated multi-container deployment

## Quick Start

### Option 1: Using the startup script (Linux/Mac)
```bash
cd docker
./start-dev.sh
```

### Option 2: Manual Docker Compose
```bash
cd docker
docker-compose up --build -d
```

### Access the Application
- **Web UI**: http://localhost:3000 (Main interface)
- **API**: http://localhost:8000 (Backend API)
- **API Documentation**: http://localhost:8000/docs

### First Steps in the UI
1. **Configure Library Paths**: Go to Libraries → Add Library Path
2. **Start Scanning**: Go to Scanning → Start Scan
3. **Monitor Progress**: Watch the Dashboard for real-time updates
4. **View Statistics**: Check Statistics page for collection insights

## Development Mode

For development with debug tools:

```bash
docker-compose --profile debug up -d
```

This includes:
- Redis Commander (http://localhost:8081)

## Configuration

Key environment variables (set in docker-compose.yml):

- `REDIS_URL`: Redis connection string
- `MONGODB_URL`: MongoDB connection string  
- `MYSQL_URL`: MySQL connection string
- `MAX_CONCURRENT_SCANS`: Maximum parallel scan operations
- `SCAN_BATCH_SIZE`: Files processed per batch

## API Endpoints

### System Management
- `GET /health` - Health check
- `GET /system/status` - Detailed system status
- `GET /api/v1/stats` - File statistics

### Library Management
- `GET /api/v1/libraries` - List library paths
- `POST /api/v1/libraries` - Add library path

### Scanning
- `POST /api/v1/scan/start` - Start scan
- `GET /api/v1/scan/status` - Scan status
- `POST /api/v1/scan/stop` - Stop scan

### Search
- `GET /api/v1/search` - Search files
- `GET /api/v1/files/{id}` - Get file metadata

### Duplicate Detection
- `GET /api/v', '#10B981', '2026-06-18 05:07:28.416929+00'),
	('28bd3864-77d9-4441-8f3d-77b2891e0d3f', '4c07b12a-4d50-4bda-bdab-874965226603', 'FS Crawler Adapter', 'Crawler adapter layer', '# FS Crawler Broker Adapter

A broker-compatible adapter that wraps the fs-crawler REST API, demonstrating how **any REST API** can be integrated into the Atomic Platform''s broker ecosystem.

## Purpose

This adapter shows the **REST-to-Broker pattern**: wrapping existing REST APIs to make them discoverable and accessible through the broker-gateway, without modifying the original service.

## Architecture

```
Angular Client
    ↓
Broker Gateway (8080)
    ↓ (queries service-registry)
    ↓ "Which service handles ''startScan''?"
    ↓
Service Registry (8085) → "fsCrawlerService at localhost:8001"
    ↓
FS Crawler Adapter (8001) → Maps broker operations to REST endpoints
    ↓
FS Crawler (8000) → Executes actual file scanning
```

## How It Works

### 1. Registration
On startup, the adapter registers with service-registry:
```python
{
  "serviceName": "fsCrawlerService",
  "operations": ["startScan", "searchFiles", "getDuplicates", ...],
  "endpoint": "http://localhost:8001",
  "framework": "FastAPI-Adapter"
}
```

### 2. Operation Mapping
The adapter maps broker operations to fs-crawler REST endpoints:

| Broker Operation | REST Endpoint | Method |
|-----------------|---------------|--------|
| `startScan` | `/scan/start` | POST |
| `searchFiles` | `/search` | GET |
| `getDuplicates` | `/duplicates/groups` | GET |
| `createRule` | `/rules` | POST |

### 3. Request Flow
```
Client → Broker Gateway → Adapter → FS Crawler
  {operation: "startScan"}  →  POST /scan/start
```

## Installation

```bash
cd python/fs-crawler-adapter

# Create virtual environment
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Configure
cp .env.example .env
# Edit .env with your settings
```

## Running

### Development
```bash
python adapter.py
```

### Production
```bash
uvicorn adapter:app --host 0.0.0.0 --port 8001
```

### With Docker
```bash
docker build -t fs-crawler-adapter .
docker run -p 8001:8001 \
  -e FS_CRAWLER_URL=http://fs-crawler:8000 \
  -e HOST_SERVER_URL=http://service-registry:8085 \
  fs-crawler-adapter
```

## Supported Operations

### Scanning
- **startScan**: Start scanning a path or all libraries
  ```json
  {
    "operation": "startScan",
    "params": {"path": "/media/music"}
  }
  ```

- **getScanStatus**: Get current scan status
  ```json
  {
    "operation": "getScanStatus",
    "params": {}
  }
  ```

### Search
- **searchFiles**: Search for files by metadata
  ```json
  {
    "operation": "searchFiles",
    "params": {
      "query": "beethoven",
      "fileType": "audio",
      "limit": 50
    }
  }
  ```

- **getFileMetadata**: Get detailed metadata for a file
  ```json
  {
    "operation": "getFileMetadata",
    "params": {"fileId": "507f1f77bcf86cd799439011"}
  }
  ```

### Statistics
- **getStatistics**: Get system statistics
  ```json
  {
    "operation": "getStatistics",
    "params": {}
  }
  ```

### Duplicates
- **g', '#06B6D4', '2026-06-18 05:07:28.45376+00'),
	('480e6431-3cea-4b73-921a-d6386465dc51', '4c07b12a-4d50-4bda-bdab-874965226603', 'Vision (LOSM Kernel)', 'LOSM vision analysis kernel', '# LOSM v0.1 Kernel

## Overview

This repository implements a minimal **LOSM (Large‑scale Open‑source Model) kernel** that demonstrates the full end‑to‑end pipeline from a user **intent** to a concrete **execution** and **validation** using a series of intermediate representations (IRs).  The architecture mirrors the specification in `implementation plan.md` and is intentionally modular so that each stage can be swapped out or extended.

---

## Table of Contents

- [Architecture Overview](#architecture-overview)
- [Completed Phases](#completed-phases)
- [How to Run the Service](#how-to-run-the-service)
- [API Endpoints](#api-endpoints)
- [Testing](#testing)
- [Development Workflow](#development-workflow)
- [Future Work / Actors](#future-work-actors)
- [CI / Deployment](#ci--deployment)

---

## Architecture Overview

```
Intent  →  PlanIR  →  SpecIR  →  ExecutionIR  →  ValidationIR
   │          │          │          │                │
   ▼          ▼          ▼          ▼                ▼
WorkRequest ─► Planner ─► Specifier ─► Docker Executor ─► Validator
```

* **WorkRequest** – persisted user intent stored in PostgreSQL (or SQLite fallback).
* **Planner** – maps an intent string to a `PlanIR` (a list of high‑level steps).
* **Specifier** – turns a `PlanIR` into concrete shell commands (`SpecIR`).
* **Executor** – runs each command inside a Docker container, persisting logs and status (`ExecutionIR`).
* **Validator** – consumes the execution result and produces a `ValidationIR` indicating success or failure.

All stages are exposed via FastAPI routes and have corresponding SQLAlchemy models for persistence.

---

## Completed Phases

| Phase | Description | Files / Modules | Status |
|------|-------------|----------------|--------|
| **1. Bootstrap FastAPI & Persistence** | Minimal FastAPI app with `/health`; settings, DB engine, `WorkRequest` model + Alembic migration. | `losm/app/main.py`, `losm/config/settings.py`, `losm/persistence/models.py`, `alembic.ini`, migration `0001_create_work_requests.py` | ✅ Completed |
| **2. PLAN IR Generation** | Planner service (`Planner`) that produces a `PlanIR` from an intent; `/plan` endpoint; tests for planner. | `losm/services/planner.py`, `losm/ir/plan_ir.py`, `losm/api/work_requests.py` (new route), `losm/tests/test_planner.py` | ✅ Completed |
| **3. SPEC IR & Docker Execution** | `SpecIR` model, `ExecutionIR`, `ValidationIR`; Docker‑based executor that runs each `SpecStep.command` in a container; execution persistence (`ExecutionRecord`). | `losm/ir/spec_ir.py`, `losm/ir/execution_ir.py`, `losm/ir/validation_ir.py`, `losm/runtime/executor.py`, `losm/persistence/models_execution.py`, migration `0002_add_execution_record.py`, executor service (`losm/services/executor_service.py`), `/execute` endpoint, tests (`losm/tests/test_execution.py`) | ✅ Completed |
| **4. VALIDATE IR** | Validator service reads `ExecutionRecord`, dete', '#3B82F6', '2026-06-18 05:07:28.490165+00'),
	('02361b3c-c314-45e9-b1fb-3ae3ef4a89fd', '4e90827e-9902-4d35-9438-9acc0158224d', 'Spring Service Registry', 'Service registry with Spring', '# Service Registry - Service Management System

A comprehensive server/service/configuration management system for the Nexus Platform. This service provides centralized management of servers, services, frameworks, deployments, and configurations across the entire microservices ecosystem.

## Table of Contents

- [Overview](#overview)
- [Quick Start](#quick-start)
- [Architecture](#architecture)
- [Data Model](#data-model)
- [REST API Reference](#rest-api-reference)
- [Backend Connections Feature](#backend-connections-feature)
- [API Examples](#api-examples)
- [Visual Diagrams](#visual-diagrams)
- [Production Deployment Guide](#production-deployment-guide)
- [Implementation Summary](#implementation-summary)
- [Future Enhancements](#future-enhancements)

---

## Overview

The Service Registry is a production-ready service management system providing centralized management of servers, services, frameworks, deployments, and configurations across the entire microservices ecosystem. It serves as the central service registry for the Nexus Platform and handles the growing complexity of managing multiple services across different frameworks (Spring Boot, Quarkus, Micronaut, NestJS, AdonisJS, Moleculer, Python, Go, Helidon, etc.) using the broker pattern.

### ✅ **PRODUCTION READY CAPABILITIES**

- **Service Registration**: External services register via `/api/registry/register`
- **Service Discovery**: Operation-based service lookup with `/api/registry/services/by-operation/{operation}`
- **Service Details**: Complete service information with `/api/registry/services/{serviceName}/details`
- **Heartbeat Monitoring**: Continuous health monitoring with `/api/registry/heartbeat/{serviceName}`
- **MySQL Persistence**: Production-grade persistent storage
- **Polyglot Support**: Framework-agnostic service integration
- **Real-time Updates**: Live service status tracking with Redis caching
- **Deployment Management**: Complete service instance tracking across servers
- **Hierarchical Services**: Parent/child (hosted/embedded) service relationships

### Design Principles

1. **Framework Agnostic** - Support for any framework: Spring Boot, Quarkus, Micronaut, NestJS, AdonisJS, Moleculer, Express, Django, Flask, FastAPI, .NET, Go, Rust, Helidon, etc.

2. **Environment Aware** - Track services across Development, Staging, Production, and Test environments

3. **Dependency Tracking** - Maintain service dependency graphs for impact analysis, deployment ordering, troubleshooting, and architecture visualization

4. **Configuration Management** - Centralized configuration with environment-specific overrides, type safety, and audit trails

5. **Deployment Tracking** - Monitor service instances with health status, version tracking, resource allocation, and lifecycle management

---

## Quick Start

### Running the Service

```bash
cd spring/service-registry
./mvnw spring-boot:run
```

Or use the provided scripts:
```bash
./start.sh      # Linux/Mac
start.bat       # Windo', '#F97316', '2026-06-18 05:07:28.588291+00'),
	('0d643384-ba49-4277-8164-6027524c5efb', '4e90827e-9902-4d35-9438-9acc0158224d', 'Spring PEB Kernel', 'PEB kernel implementation', '# PEB Kernel (Persistent Engineering Brain)

The PEB Kernel is a Spring Boot application acting as the governance, state management, and orchestration backend for the Nexus ecosystem. It implements a deterministic, event-sourced requirements capture system utilizing a Merkle-tree backed state ledger.

## Architecture

This project is built as a Maven multi-module architecture to strictly enforce domain-driven boundaries and separation of concerns.

### Modules

- **`peb-domain`**: Core entities (`PebState`, `PebDecision`, `PebTransaction`, `PebTrace`, `PebViolation`, `PebCapability`), value objects (`PebStateHash`), and Enums.
- **`peb-store`**: Data persistence layer using Spring Data JPA and Flyway SQL migrations (`V1__init_peb_schema.sql`) backed by PostgreSQL.
- **`peb-core`**: Core business logic containing the `PebGovernanceEngine`, `PebTransactionEngine`, and `InvariantValidator`.
- **`peb-hash`**: Contains the `PebHashService` responsible for generating and validating Merkle chain checksums.
- **`peb-api`**: Exposes the REST facades (e.g., `AdmissionControllerFacade`) for external invocation (specifically from `conduit-mcp`).
- **`peb-adapters`**: Houses adapters bridging the JVM domain to other ecosystems (e.g., `ConduitMcpAdapter`, `LosmIrTransitionAdapter`).
- **`peb-bootstrap`**: The application launcher (`@SpringBootApplication`) containing the central `application.yml` and context configurations.
- **`peb-observability` / `peb-test`**: Telemetry and test boundaries (implementation ongoing).

## Getting Started

### Prerequisites
- Java 21+
- PostgreSQL
- Maven 3.9+

### Building

To build the entire kernel and its submodules, run from the root of this directory:

```bash
mvn clean install
```

### Running

To run the application locally, ensure your PostgreSQL database matches the `application.yml` credentials, then execute the `peb-bootstrap` module:

```bash
cd peb-bootstrap
mvn spring-boot:run
```
', '#F59E0B', '2026-06-18 05:07:28.630549+00'),
	('d12a90b4-f59a-41d8-928e-31d93133d3e5', '4e90827e-9902-4d35-9438-9acc0158224d', 'Spring Topology Server', 'Topology service for service mesh', '# Topology Server

Spring Boot microservice that centralizes broker gateway and service registry configuration, replacing the IndexedDB storage previously used by the nexus-console frontend.

## Overview

- **Port:** 8084
- **Framework:** Spring Boot 3.5.0 / Java 21
- **Database:** MySQL (schema: `topology_server`)
- **Path:** `jvm/spring/topology-server/`

## Data Model

### Broker Profiles

Stores connection details for broker gateway instances. Each profile is uniquely identified by a `profileId` string key.

| Field | Type | Description |
|-------|------|-------------|
| `profileId` | VARCHAR | Unique key (e.g. `"default-local"`) |
| `name` | VARCHAR | Display name |
| `brokerUrl` | VARCHAR | Gateway URL (e.g. `"localhost:8081"`) |
| `imageUrl` | VARCHAR | Image server URL |
| `autoConnect` | BOOLEAN | Auto-connect on app startup |
| `healthCheckDelayMinutes` | INTEGER | Health check polling interval |

### Registry Server Profiles

Stores service registry connection configurations. Each profile is uniquely identified by a `profileId` string key.

| Field | Type | Description |
|-------|------|-------------|
| `profileId` | VARCHAR | Unique key (e.g. `"default-local-host"`) |
| `name` | VARCHAR | Display name |
| `registryServerUrl` | VARCHAR | Service registry URL |
| `imageUrl` | VARCHAR | Image server URL |
| `isActive` | BOOLEAN | Whether this is the active profile |
| `description` | VARCHAR | Notes (optional) |

## REST API

All endpoints return `PagedResponse<T>` matching the service-registry response format.

### Broker Profiles

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/v1/broker-profiles` | List all (paginated, sorted by name) |
| `GET` | `/api/v1/broker-profiles/{id}` | Get by database ID |
| `POST` | `/api/v1/broker-profiles` | Create new |
| `PUT` | `/api/v1/broker-profiles/{id}` | Update existing |
| `DELETE` | `/api/v1/broker-profiles/{id}` | Delete |

### Registry Server Profiles

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/v1/registry-server-profiles` | List all (paginated, sorted by name) |
| `GET` | `/api/v1/registry-server-profiles/{id}` | Get by database ID |
| `POST` | `/api/v1/registry-server-profiles` | Create new |
| `PUT` | `/api/v1/registry-server-profiles/{id}` | Update existing |
| `DELETE` | `/api/v1/registry-server-profiles/{id}` | Delete |

## Seeding

A `CommandLineRunner` (`TopologyDataInitializer`) reads default profile data from JSON config files on first startup:

- `src/main/resources/config/broker-profiles.json`
- `src/main/resources/config/registry-server-profiles.json`

If the database already contains records, seeding is skipped. This ensures data persists across restarts.

## Running

```bash
cd jvm/spring/topology-server
mvn spring-boot:run
```

Requires MySQL running on `localhost:3306`. The database `topology_server` is auto-created on first connect.

## Migration from IndexedDB

The nexus-console frontend currently stores p', '#10B981', '2026-06-18 05:07:28.672062+00'),
	('c587e507-725f-4bb9-b08d-04a5bcd91cee', '4e90827e-9902-4d35-9438-9acc0158224d', 'Helidon', 'Helidon microservice stack', '# Api client library for Java

Api client library for Java.

This package contains Api client library.

## Getting started

### Prerequisites

- [Java Development Kit (JDK)][jdk] with version 8 or above

### Adding the package to your product

```xml
<dependency>
    <groupId>io.clientcore</groupId>
    <artifactId>aibizarchitect-nexus-v1-servicebroker-api</artifactId>
    <version>1.0.0-beta.1</version>
</dependency>
```

<!-- LINKS -->
[jdk]: https://learn.microsoft.com/azure/developer/java/fundamentals/
', '#06B6D4', '2026-06-18 05:07:28.712797+00'),
	('54db57d8-92a0-4910-8199-a9934473a816', '4e90827e-9902-4d35-9438-9acc0158224d', 'Helidon User Access Service', 'User access service on Helidon', '# user-access-service

Sample Helidon MP project that includes multiple REST operations.

## Build and run


With JDK21
```bash
mvn package
java -jar target/user-access-service.jar
```

## Exercise the application

```
curl -X GET http://localhost:8080/health
{"outcome":"UP",...}
```

## Try health
```
curl -s -X GET http://localhost:8080/health
{"outcome":"UP",...

```


## Building a Native Image

The generation of native binaries requires an installation of GraalVM 22.1.0+.

You can build a native binary using Maven as follows:

```
mvn -Pnative-image install -DskipTests
```

The generation of the executable binary may take a few minutes to complete depending on
your hardware and operating system. When completed, the executable file will be available
under the `target` directory and be named after the artifact ID you have chosen during the
project generation phase.



## Try metrics

```
# Prometheus Format
curl -s -X GET http://localhost:8080/metrics
# TYPE base:gc_g1_young_generation_count gauge
. . .

# JSON Format
curl -H ''Accept: application/json'' -X GET http://localhost:8080/metrics
{"base":...
. . .
```



## Building the Docker Image

```
docker build -t user-access-service .
```

## Running the Docker Image

```
docker run --rm -p 9093:9093 user-access-service:latest
```

Exercise the application as described above.
                                

## Run the application in Kubernetes

If you don’t have access to a Kubernetes cluster, you can [install one](https://helidon.io/docs/latest/#/about/kubernetes) on your desktop.

### Verify connectivity to cluster

```
kubectl cluster-info                        # Verify which cluster
kubectl get pods                            # Verify connectivity to cluster
```

### Deploy the application to Kubernetes

```
kubectl create -f app.yaml                              # Deploy application
kubectl get pods                                        # Wait for quickstart pod to be RUNNING
kubectl get service  user-access-service                     # Get service info
kubectl port-forward service/user-access-service 8081:9093   # Forward service port to 8081
```

You can now exercise the application as you did before but use the port number 8081.

After you’re done, cleanup.

```
kubectl delete -f app.yaml
```


## Building a Custom Runtime Image

Build the custom runtime image using the jlink image profile:

```
mvn package -Pjlink-image
```

This uses the helidon-maven-plugin to perform the custom image generation.
After the build completes it will report some statistics about the build including the reduction in image size.

The target/user-access-service-jri directory is a self contained custom image of your application. It contains your application,
its runtime dependencies and the JDK modules it depends on. You can start your application using the provide start script:

```
./target/user-access-service-jri/bin/start
```

Class Data Sharing (CDS) Archive
Also included in the custom image is', '#3B82F6', '2026-06-18 05:07:28.747967+00'),
	('b1453c1d-58d4-4869-a8b9-cf2d3c505ed9', '4e90827e-9902-4d35-9438-9acc0158224d', 'Quarkus', 'Quarkus service implementation', '# Api client library for Java

Api client library for Java.

This package contains Api client library.

## Getting started

### Prerequisites

- [Java Development Kit (JDK)][jdk] with version 8 or above

### Adding the package to your product

```xml
<dependency>
    <groupId>io.clientcore</groupId>
    <artifactId>aibizarchitect-nexus-v1-servicebroker-api</artifactId>
    <version>1.0.0-beta.1</version>
</dependency>
```

<!-- LINKS -->
[jdk]: https://learn.microsoft.com/azure/developer/java/fundamentals/
', '#6366F1', '2026-06-18 05:07:28.781841+00'),
	('ad25d5df-19e1-49c7-b317-c2f4ef51f4f8', '4e90827e-9902-4d35-9438-9acc0158224d', 'Quarkus Broker Gateway', 'Broker gateway on Quarkus', '# Quarkus-based Broker Gateway Service

## Overview

The `quarkus-broker-gateway` is a Quarkus-based implementation of the broker gateway service that complements the existing Spring Boot broker-gateway. It provides the same core functionality but leveraging the Quarkus framework for potentially improved performance, lower memory consumption, and native compilation support.

## Technology Stack

- **Framework**: Quarkus 3.15.1
- **Runtime**: Java 21
- **REST Framework**: RESTEasy Reactive
- **Serialization**: Jackson for JSON processing
- **Configuration**: SmallRye Config
- **Service Discovery**: REST Client for inter-service communication
- **Packaging**: Standard JAR with Quarkus plugin

## Architecture

This service mirrors the existing broker-gateway functionality:

- Request routing and dispatching
- Service orchestration
- Health monitoring
- External service communication
- Integration with the existing Nexus platform architecture

## Configuration

### application.properties

The service is configured through `src/main/resources/application.properties`:

```properties
# Server configuration
quarkus.http.port=8090
quarkus.application.name=quarkus-broker-gateway

# Logging
quarkus.log.level=INFO
quarkus.log.category."com.angrysurfer.nexus".level=DEBUG

# REST Client configuration (for calling other services)
quarkus.rest-client.prod-api.url=http://localhost:8080

# External services configuration
external.services.urls.user-service=http://localhost:8083
external.services.urls.login-service=http://localhost:8082
external.services.urls.file-service=http://localhost:8081
external.services.urls.search-service=http://localhost:8084

# External API client configuration
quarkus.rest-client.external-api.url=http://localhost:8080
```

### Environment Variables (Optional)

The service can also be configured using environment variables that override properties:

- `QUARKUS_HTTP_PORT` - Override the HTTP port
- `EXTERNAL_SERVICES_URLS_USER_SERVICE` - Override user-service URL
- `EXTERNAL_SERVICES_URLS_LOGIN_SERVICE` - Override login-service URL
- `EXTERNAL_SERVICES_URLS_FILE_SERVICE` - Override file-service URL
- `EXTERNAL_SERVICES_URLS_SEARCH_SERVICE` - Override search-service URL

## API Endpoints

### Routing

- **POST** `/api/route/{service}/{operation}`
  - Route requests to specific services with operations
  - Expects a JSON payload in the body
  - Example: `POST /api/route/user-service/create-user` with user data in body

### Health Check

- **GET** `/api/health`
  - Returns service health status
  - Example response: `{"status":"UP", "service":"quarkus-broker-gateway", "port":"8090"}`

### Service Listing

- **GET** `/api/services`
  - Lists available services
  - Example response: `"Available services: user-service, file-service, login-service, search-service"`

## Starting the Service

### Development Mode

```bash
cd /home/codex/dev/WORK/nexus/quarkus', '#8B5CF6', '2026-06-18 05:07:28.815137+00'),
	('4a8765db-68e2-47b9-a9ce-6ce712cb260f', '4e90827e-9902-4d35-9438-9acc0158224d', 'Shared Core', 'Shared core library for JVM services', 'Canonical Core for Nexus Polyglot Services

- This module contains language-agnostic core models that serve as the single source of truth for the platform.
- Adapters for Spring, Helidon, and Quarkus map between these canonical models and framework-specific DTOs.
- The goal is to incrementally migrate from com.angrysurfer.* packages to com.aibizarchitect.* while keeping a working system.

-How it works
- Core models live under com.aibizarchitect.nexus.core (BinaryData, ResponseError, PagedResponse).
- Adapters under java/adapters.* provide mappings and glue to each framework.
- Legacy code remains in place during migration and is marked deprecated to guide the transition.

Migration notes
- Start by wiring the canonical core into the Spring adapter (already scaffolded).
- Add similar adapters for Helidon and Quarkus when ready.
- Keep the core language-agnostic; avoid framework-specific types in core.
', '#EC4899', '2026-06-18 05:07:28.852087+00'),
	('e0f4dc4d-eb30-4253-a3f6-68bec56a4317', '4e90827e-9902-4d35-9438-9acc0158224d', 'Ballerina', 'Ballerina integration services', '# Nexus Ballerina Layer

## Purpose

This directory contains experiments and services built using **Ballerina** as an architectural boundary around **Nexus Core**.

The goal is **not** to re-implement Nexus in Ballerina.

Instead, Ballerina is used as a **moat** separating Nexus Core from the expanding ecosystem of external tools, integrations, and automation services — what can loosely be described as *the Web Services Sprawl*.

---

## Architectural Intent

Nexus Core deliberately maintains a narrow responsibility:

- Service registry
- Service broker
- Service lifecycle management
- Deployment orchestration
- Observability integration

Nexus Core **does not**:

- depend on a specific CI/CD platform
- embed vendor tooling
- assume a cloud provider
- know about external automation ecosystems
- directly integrate with third-party service APIs

This constraint is intentional.

Nexus Core exists as a **platform kernel**, not an integration hub.

---

## Why Ballerina?

Ballerina is well suited for acting as an **integration boundary layer** because it treats network services as first-class concepts:

- Native HTTP/service modeling
- Strong typing across service boundaries
- Explicit contracts
- Built-in client/service symmetry
- Designed for integration rather than infrastructure ownership

Where Nexus Core manages *services*, Ballerina manages *connections between systems*.

---


Ballerina services serve as:

- protocol adapters
- policy enforcement layers
- API façades
- translation services
- isolation boundaries

This prevents external ecosystem churn from leaking into Nexus Core.

---

## Separation of Concerns

### Nexus Core Responsibilities

- Service registry & discovery
- Service creation workflows
- Deployment orchestration
- Runtime coordination
- Observability aggregation
- Internal system contracts

Nexus Core is intentionally **integration-agnostic**.

---

### Ballerina Layer Responsibilities

- External tool integrations
- MCP server adapters
- CI/CD bridges
- SaaS connectors
- API normalization
- Credential and boundary isolation
- Event ingestion/export

If an integration can change independently of Nexus Core, it belongs here.

---

## Design Principles

### 1. Protect the Core

External services evolve rapidly.  
Nexus Core should not.

Ballerina absorbs volatility.

---

### 2. Integration is Not Platform Logic

Integrations are adapters, not architecture.

They should be replaceable without modifying Nexus Core.

---

### 3. Contracts Over Configuration

Communication between Ballerina services and Nexus Core should occur through explicit service contracts rather than shared configuration or implicit assumptions.

---

### 4. Replaceable Edge

Any Ballerina service should be disposable:

- delete it
- replace it
- rewrite it
- run multiple variants

without destabilizing Nexus Core.

---

## Example Use Cases

Potential services in this layer include:

- GitHub / GitLab CI bridge
- Kubernetes deployment adapters
- MCP ser', '#F43F5E', '2026-06-18 05:07:28.889871+00'),
	('40341e52-8f82-4fd9-a598-889cadfe2c9d', 'a18d0460-ffdf-410c-a7f9-d150f302477a', 'CCNF Reference', 'Canonical normalization reference implementation', '# CCNF Reference Implementation — nexus-ccnf-ref

## Purpose

Ground-truth oracle for the CER Canonical Normalization Function (CCNF).
Not production. Not optimized. Just correct.

Every other implementation of CCNF must prove bitwise equivalence against this module.

## Non-Goals

- NOT optimized for performance
- NOT a production runtime
- NOT extensible without version epoch change
- NOT a convenience library
- NOT backward-compatibility preserving across CCNF versions

## Why This Exists

Distributed systems fail when behavior depends on implementation details.
This repository exists to make correctness independent of language, runtime, or organization.

## Authority Model

| Authority | Source |
|---|---|
| Specification authority | `spec/*.md` + `SERIALIZATION_CONTRACT.md` + Golden Vectors |
| Behavioral authority | `ccnf-conformance` binary |
| Correctness | No other implementation defines it |

## Architecture

```
Raw Input
    ↓
CCNF — 8-step deterministic normalization
  ├── 1. structural_parse     raw → intermediate schema
  ├── 2. canonicalize_fields  key order, type norm, NFC, timestamps
  ├── 3. derive_identity      entity_key (pure over static fields)
  ├── 4. normalize_intent     controlled vocabulary
  ├── 5. resolve_artifacts    type:id references
  ├── 6. compute_state_delta  artifact-scoped patch
  ├── 7. serialize            fixed field order, compact JSON
  └── 8. hash + sign          SHA256
    ↓
CER Event
    ↓
Replay Engine (pure fold over rehydrated events)
    ↓
Snapshot Oracle (minimal, in-memory, synchronous)
```

## Repository Layout

```
ccnf-ref/
  SERIALIZATION_CONTRACT.md       ← immutable root commit — 9 serialization rules
  README.md                       ← this file
  Makefile                        ← R1–R6 CI targets
  go.mod                          ← module github.com/anomalyco/nexus-ccnf-ref

  spec/                           ← Formal RFC-style specifications
    CCNF_SPEC.md                  ← canonical serialization, normalization, pipeline
    CER_SPEC.md                   ← CER schema, field semantics, structural invariants
    REPLAY_SPEC.md                ← fold semantics, cursor model, delta merge rules
    SNAPSHOT_SPEC.md              ← snapshot builder, validation, tri-version lock
    VERSIONING_MODEL.md           ← version contract, migration policy

  vectors/
    v1/                           ← 32 golden vector files (input → expected hash)
    expected-hashes.json          ← master hash table for v1
    r2/collisions/                ← collision atlas (87.5k inputs, 0 collisions)

  ccnf/
    serializer.go                 ← THE ONLY canonical serializer in the system
    ccnf.go                       ← Run() entry point — 8-step pipeline orchestration
    structural_parse.go           ← step 1
    canonicalize.go               ← step 2
    identity.go                   ← step 3 — enti', '#EF4444', '2026-06-18 05:07:28.946336+00'),
	('3ba097f6-7e66-4be8-bc90-daa5c9437a18', '534dab1a-5a34-47b4-af1e-8fcefd579423', 'CCNF Verifier', 'Rust CCNF verification engine', '# ccnf-verifier (Rust)

Independent Rust verifier for CCNF correctness and runtime invariants.

This crate is intentionally paired with the Go reference oracle at:

- `../../../go/wrp/ccnf-ref`

The Rust verifier is used as a cross-language correctness gate and should never redefine protocol semantics independently of the frozen CCNF contract.

## Purpose

- Validate Rust CCNF pipeline output against Go golden vectors (`R8`).
- Mirror runtime boundary behavior (`R9`).
- Mirror replay behavior (`R10`).

## Run

From this directory:

```bash
cargo run --release -- ../../../go/wrp/ccnf-ref/vectors/v1
```

Equivalent invocation from the Go reference repo:

```bash
cargo run --release --manifest-path ../../../rust/wrp/ccnf-verifier/Cargo.toml -- ../../../go/wrp/ccnf-ref/vectors/v1
```

## Test

```bash
cargo test
```

Focused gate checks used by Go Make targets:

```bash
cargo test -- runtime::types runtime::trace
cargo test -- runtime::replay
```

## Contract Notes

- Golden vectors are append-only.
- Any change to frozen canonicalization semantics requires versioned contract change, not local behavior drift.
- Rust and Go must remain hash-equivalent for shared vectors.
', '#EF4444', '2026-06-18 05:07:29.001374+00'),
	('d89ef5aa-0293-4037-ab11-40b68991727e', '717e8d19-813b-4bad-9d8c-a849ad147fd2', 'Search Service', 'Moleculer-based search service', '# Moleculer Search Service

A Moleculer-based microservices application providing multiple search providers (Google, Gemini, Unsplash, etc.) that integrates with the Spring Boot broker-gateway via service registration.

## Architecture

```
Angular Client -> Broker Gateway -> Moleculer Search Service
                       ↑                    ↓
                       |              (registers with)
                       |                    ↓
                  Service Registry ←─────────────┘
                (Service Registry)
                       
Moleculer Services:
├── Google Search
├── Gemini Search (future)
└── Unsplash Search (future)
```

## Features

- **Modular Search Providers**: Each search type is an independent Moleculer service
- **Service Registration**: Automatically registers with Spring service-registry on startup
- **Health Checks**: Provides health endpoints for monitoring
- **RESTful API**: Exposes HTTP endpoints via moleculer-web
- **Hot Reload**: Development mode with automatic service reloading

## Services

### google-search
Provides Google Custom Search API integration
- **Action**: `simpleSearch` - Performs basic Google search
- **Params**: `{ query: string, token?: string }`

### api
HTTP gateway service using moleculer-web
- **Endpoint**: `POST /api/search/simple` - Trigger Google search
- **Endpoint**: `GET /api/health` - Health check

### registry-client
Handles registration with Service Registry
- Registers on startup via REST API
- Periodic heartbeat re-registration (every 30s)
- Automatic retry on failure
- Persistent registration in H2 database

## Setup

1. Install dependencies:
```bash
npm install
```

2. Configure environment:
```bash
cp .env.example .env
# Edit .env with your Google API credentials
```

3. Run in development mode:
```bash
npm run dev
```

4. Build for production:
```bash
npm run build
npm start
```

## Environment Variables

- `SERVICE_REGISTRY_URL` - Service Registry registry endpoint (default: http://localhost:8085/api/v1/registry)
- `GOOGLE_API_KEY` - Google Custom Search API key
- `GOOGLE_SEARCH_ENGINE_ID` - Google Custom Search Engine ID
- `SERVICE_PORT` - Port for HTTP API (default: 4050)
- `SERVICE_HOST` - Host for service registration (default: localhost)

## Integration with Service Registry

The service automatically registers with the Service Registry on startup via REST API:

```json
{
  "serviceName": "moleculer-search",
  "operations": ["simpleSearch"],
  "endpoint": "http://localhost:4050",
  "healthCheck": "http://localhost:4050/api/health",
  "framework": "Moleculer",
  "version": "1.0.0",
  "port": 4050,
  "metadata": {
    "type": "moleculer",
    "provider": "google"
  }
}
```

The registration is persisted in the Service Registry''s H2 database. The Broker Gateway queries the Service Registry to route requests to registered services.

## Adding New Search Providers

Create a new service file in `services/`:

```typ', '#EF4444', '2026-06-18 05:07:29.059336+00'),
	('61547918-1fd9-4154-a416-25c89bb58c8c', 'b3be6007-7b61-47bb-85f9-335e80d7f50e', 'Broker Gateway Proxy', 'AdonisJS broker gateway proxy', '# Broker Gateway Proxy

An AdonisJS-based reverse proxy that sits in front of `spring/broker-gateway` to provide cross-cutting concerns like rate limiting, request logging, and future authorization capabilities.

## Architecture

```
┌─────────────────┐     ┌─────────────────────────────┐     ┌──────────────────┐
│  Clients        │────▶│  broker-gateway-proxy       │────▶│  broker-gateway  │
│  (Nexus UI,     │     │  (AdonisJS)                 │     │  (Spring)        │
│   etc.)         │     │  Port: 8080                 │     │  Port: 8081      │
└─────────────────┘     └─────────────────────────────┘     └──────────────────┘
                                  │
                                  ▼
                        ┌─────────────────┐
                        │  Registry Service    │
                        │  (Registration) │
                         │  Port: 8085     │
                        └─────────────────┘
```

## Project Structure

| File | Purpose |
|------|---------|
| `.env` | Environment configuration (port 8080, upstream URL, service-registry settings) |
| `config/proxy.ts` | Proxy configuration (upstream URL, timeout, headers to strip/add) |
| `start/env.ts` | Environment schema validation for all required variables |
| `start/routes.ts` | Route definitions (health check + catch-all proxy) |
| `start/host_server.ts` | Preload script for service-registry registration on startup |
| `app/services/proxy_service.ts` | Core proxy logic - forwards requests to broker-gateway with proper error handling |
| `app/services/host_server_client.ts` | Host-server registration and heartbeat client |
| `app/controllers/proxy_controller.ts` | HTTP controller that delegates to ProxyService |

## Key Features

1. **Transparent Proxying**: All requests (except `/health`) are forwarded to broker-gateway
2. **ServiceResponse Error Format**: When the upstream fails, the proxy returns errors in the same JSON format as broker-gateway:

   ```json
   {
     "ok": false,
     "data": null,
     "errors": [{ "field": "proxy", "message": "Upstream request failed: ..." }],
     "requestId": "proxy-1234567890-abc123",
     "ts": "2026-01-21T04:00:00.000Z",
     "version": "1.0",
     "service": "broker-gateway-proxy",
     "operation": "POST /api/broker/submit",
     "encrypt": false
   }
   ```

3. **Registry Service Registration**: On startup, the proxy registers with service-registry and sends heartbeats every 30 seconds
4. **Graceful Shutdown**: Deregisters from service-registry on application termination
5. **Request Context Head', '#EF4444', '2026-06-18 05:07:29.113928+00'),
	('57eca60a-8b8a-469f-920b-367e40d7763b', '9ae9e43c-5f58-48cc-a008-08533f64c226', 'Bash Scripts', 'Shell automation scripts', '# Bash Scripts

This directory contains shell scripts for building and running the application in a Bash-like environment (e.g., Linux, macOS, or Windows Subsystem for Linux), using the `npm` scripts defined in `package.json`.

## Scripts

-   `start.sh`: Installs all necessary `npm` dependencies and then launches the application in development mode using `npm run dev`.
-   `build.sh`: Installs all necessary `npm` dependencies and then runs the `npm run build` script to create a production-ready build of the application. The output will be located in the `dist/` directory at the project root.

## Usage

Before running, you may need to make the scripts executable:

```bash
chmod +x start.sh
chmod +x build.sh
```

Then, you can run them from the project root directory:

```bash
./bash/start.sh
```
or
```bash
./bash/build.sh
```', '#EF4444', '2026-06-18 05:07:29.184879+00'),
	('b8f70612-cb81-40a1-8453-9fd7ab47b134', '9ae9e43c-5f58-48cc-a008-08533f64c226', 'PowerShell Scripts', 'PowerShell automation scripts', '# Windows Batch Scripts

This directory contains `.bat` batch scripts for building and running the application on Windows using the Command Prompt (`cmd.exe`), based on the `npm` scripts in `package.json`.

## Scripts

-   `start.bat`: Installs all necessary `npm` dependencies and then launches the application in development mode using `npm run dev`.
-   `build.bat`: Installs all necessary `npm` dependencies and then runs the `npm run build` script to create a production-ready build of the application. The output will be located in the `dist/` directory at the project root.

## Usage

You can run these scripts by double-clicking them in the Windows File Explorer or by running them from the Command Prompt from the project root directory:

```cmd
.\\pwsh\\start.bat
```
or
```cmd
.\\pwsh\\build.bat
```', '#F97316', '2026-06-18 05:07:29.221882+00'),
	('11feb3f2-d51b-45a3-9516-9fa0ab689d56', '9ae9e43c-5f58-48cc-a008-08533f64c226', 'Agent Docs', 'Agent architecture and operating model docs', '>**Nexus WRP aspirational architecture (inactive).** This document describes
> the intended design of the Nexus Work Request Pipeline, which is under
> construction and not yet operational. The active system is **Conduit**
> (see `nexus/python/conduit/` and `nexus/typescript/conduit-mcp/`). The
> only shared concept between Nexus and Conduit is the `WorkRequest` type.
> 
# WorkRequest Compiler — README

## Overview

The **WorkRequest Compiler** is the execution engine that converts structured *Work Requests* into reproducible AI-assisted development actions.

It exists to solve a specific problem:

> **How do we turn conversational design decisions into deterministic, auditable implementation work?**

Instead of treating LLM interaction as chat, this system treats it as a **compile pipeline**:

```
Intent → WorkRequest → Prompt → Model Execution → Implementation → Record
```

The compiler ensures that work is:

* reproducible
* logged
* project-scoped
* model-agnostic
* resumable

---

## Core Concepts

### WorkRequest

A **WorkRequest** represents a single unit of intentional work.

Examples:

* implement a feature
* refactor a subsystem
* synchronize implementation with plans
* generate architecture artifacts

A WorkRequest is **not** a prompt.

It is closer to:

* a build target
* a task specification
* a compilation unit

---

### Compiler Philosophy

The system follows a *compiler mental model*:

| Compiler Concept | WorkRequest Equivalent               |
| ---------------- | ------------------------------------ |
| Source code      | Design intent / conversation outcome |
| AST              | WorkRequest folder                   |
| Code generation  | Prompt construction                  |
| Backend          | Selected LLM                         |
| Object file      | Implementation changes               |
| Build artifacts  | Records + logs                       |

The goal is **deterministic AI usage**, not ad-hoc prompting.

---

## Directory Structure

Each project contains a project-local pipeline workspace.

```
<Project Root>
│
├── .agent/
│   └── scripts/
│       ├── process.sh
│       └── executor.py
│
└── .pipeline/
    ├── IMPLEMENTATION_PLAN_RECORD/
    ├── PROMPT_RECORDS/
    └── WORK_REQUESTS/
        ├── active/
        ├── artifacts/
        ├── complete/
        ├── failed/
        ├── log/
        └── queued/
```

> **Note:** The `.pipeline/` workspace shown above is the **aspirational Nexus
> WRP** directory structure. The active **Conduit** system stores its data in
> `nexus/.conduit-data/` instead. These are separate — Conduit is temporary
> scaffolding, and the eventual Nexus WRP may use a different layout.

### Important Rules

* `process.sh` and `executor.py` exist **once only**.
* WorkRequests are **replicated per project**, not globally.
* Logs live *with the work*, not with the tooling.

---

## Components
', '#F59E0B', '2026-06-18 05:07:29.259316+00'),
	('ffd13ce8-38c1-49a4-b330-6fd169217ed5', '9ae9e43c-5f58-48cc-a008-08533f64c226', 'CER/CCNF Conformance Tests', 'Conformance test suite for CCNF', '>**Nexus WRP aspirational architecture (inactive).** This document describes
> the intended design of the Nexus Work Request Pipeline, which is under
> construction and not yet operational. The active system is **Conduit**
> (see `nexus/python/conduit/` and `nexus/typescript/conduit-mcp/`). The
> only shared concept between Nexus and Conduit is the `WorkRequest` type.
> 
# CER CCNF Conformance Test Suite

## Purpose

This test suite validates that any implementation of the CER Canonical Normalization Function (CCNF) produces **bitwise-identical output** for identical input, across all hosts, environments, and serialization libraries.

CCNF determinism (I8) is the foundation of the entire system. If CCNF is even slightly off — whitespace rules, key ordering, numeric normalization — the downstream system breaks silently: divergent `entity_key` across hosts, broken snapshot verification, collapse mismatch, replay drift.

## Test Vectors

### Structure

```
.agent/tests/cer-ccnf-conformance/
  README.md
  spec/
    CONFORMANCE_SPEC.md     — formal test specification
  vectors/
    v1/                     — CCNF version 1 vectors
      001-*.json
      002-*.json
      ...
    expected-hashes.json    — master hash table for all v1 vectors
```

### Vector Format

Each vector file contains:

| Field | Description |
|---|---|
| `name` | Descriptive name of the test case |
| `ccnf_version` | CCNF version this vector targets |
| `invariants_tested` | List of invariants validated by this vector |
| `input` | Raw event input (pre-CCNF) |
| `expected` | Expected output (CER or error) |

**Success case:**
```json
{
  "name": "node-creation",
  "ccnf_version": 1,
  "invariants_tested": ["I8", "I11"],
  "input": { ... },
  "expected": {
    "cer": { ... full CER output ... },
    "entity_key": "sha256-hex",
    "canonical_hash": "sha256-of-serialized-CER"
  }
}
```

**Error case:**
```json
{
  "name": "intent-normalization-failure",
  "ccnf_version": 1,
  "invariants_tested": ["I8"],
  "input": { ... },
  "expected": {
    "error": "INTENT_NORMALIZATION_FAILURE"
  }
}
```

## Running the Tests

1. Load `vectors/v1/` directory
2. For each vector:
   a. Apply CCNF(v1) to `input`
   b. If `expected.error` is set: assert CCNF raises exactly that error
   c. If `expected.cer` is set: assert every field in `expected.cer` matches output
   d. Assert `output.signature.hash == expected.canonical_hash`
   e. Assert `output.identity.entity_key == expected.entity_key`
3. Verify that the master hash table `expected-hashes.json` is consistent with per-vector hashes

## What Each Vector Validates

See `spec/CONFORMANCE_SPEC.md` for the formal mapping between vectors and invariants.

## Adding Vectors

1. Create a new file in `vectors/v1/` following the vector format
2. Compute `expected.entity_key` via CCNF Step 3 rules
3. Compute `expected.canonical_hash` via CCNF Step 7 + Step 8
4. Add the hash to `expected-hashes.json`
5. Update `spec/CONFORMANCE_SPEC.md` if new i', '#10B981', '2026-06-18 05:07:29.294572+00');


--
-- Data for Name: features; Type: TABLE DATA; Schema: nebula; Owner: -
--

INSERT INTO nebula.features VALUES
	('a4000000-0000-0000-0000-000000000001', 'a3000000-0000-0000-0000-000000000001', 'OAuth Login', 'Google OAuth integration', 'OAuth implementation details...', '2026-06-16 21:37:36.456339+00'),
	('a4000000-0000-0000-0000-000000000002', 'a3000000-0000-0000-0000-000000000001', 'Password Reset', 'Forgot password flow', NULL, '2026-06-16 21:37:36.456339+00');


--
-- Data for Name: requirements; Type: TABLE DATA; Schema: nebula; Owner: -
--

INSERT INTO nebula.requirements VALUES
	('a5000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', 'a3000000-0000-0000-0000-000000000001', 'a4000000-0000-0000-0000-000000000001', 'Implement Google OAuth', 'Users should be able to log in with Google', 'InProgress', 'High', NULL, NULL, '2026-06-16 21:37:36.456339+00', '2026-06-16 21:37:36.456339+00'),
	('a5000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-000000000001', 'a3000000-0000-0000-0000-000000000001', 'a4000000-0000-0000-0000-000000000002', 'Add password reset email', 'Send email with reset link', 'Backlog', 'Medium', NULL, NULL, '2026-06-16 21:37:36.456339+00', '2026-06-16 21:37:36.456339+00');


--
-- Data for Name: system_folders; Type: TABLE DATA; Schema: nebula; Owner: -
--

INSERT INTO nebula.system_folders VALUES
	('a2000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', 'webapp', 'UI', 'Frontend app'),
	('a2000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-000000000001', 'api', 'Service', 'Backend API');


--
-- Data for Name: system_info_tabs; Type: TABLE DATA; Schema: nebula; Owner: -
--

INSERT INTO nebula.system_info_tabs VALUES
	('a1000000-0000-0000-0000-000000000001', 'specification', '# Specification

The system should support OAuth2.', '2026-06-16 21:38:10.141076+00'),
	('a1000000-0000-0000-0000-000000000001', 'notes', '# Notes

Remember to add rate limiting.', '2026-06-16 21:38:10.141076+00');


--
-- Data for Name: system_workspaces; Type: TABLE DATA; Schema: nebula; Owner: -
--

INSERT INTO nebula.system_workspaces VALUES
	('760b0145-facf-4ee1-b29c-808c83de6f3d', '3ca9a102-6d27-4a1c-93bc-c04d12515994', NULL, 'angular/conduit-ui', '2026-06-18 05:07:27.577967+00'),
	('d62f8967-d1f5-4667-8659-ca0c7ce833dd', '3ca9a102-6d27-4a1c-93bc-c04d12515994', NULL, 'angular/nebula-ui', '2026-06-18 05:07:27.616431+00'),
	('f41ecbf0-7444-4f0e-a6fc-bb245d2379cb', '3ca9a102-6d27-4a1c-93bc-c04d12515994', NULL, 'angular/nexus-console', '2026-06-18 05:07:27.650192+00'),
	('fa544910-e109-4cbb-b608-45370e6a9e4a', '3ca9a102-6d27-4a1c-93bc-c04d12515994', NULL, 'angular/duality-ui', '2026-06-18 05:07:27.683774+00'),
	('26a09fcf-11b5-4c14-b95f-b46217133345', '3ca9a102-6d27-4a1c-93bc-c04d12515994', NULL, 'angular/plurality-ui', '2026-06-18 05:07:27.720106+00'),
	('3c93eb89-087e-4b6e-b735-f5a36d200169', '3ca9a102-6d27-4a1c-93bc-c04d12515994', NULL, 'angular/nexus-orb', '2026-06-18 05:07:27.75623+00'),
	('6fd4d213-fa98-497e-829b-4a58f41b04b7', '3ca9a102-6d27-4a1c-93bc-c04d12515994', NULL, 'angular/prompt-architect', '2026-06-18 05:07:27.796624+00'),
	('862038e3-f539-4ed0-8767-7e68da885fdc', '924dd171-e407-49ab-8902-570ac8d914a7', NULL, 'typescript/conduit-mcp', '2026-06-18 05:07:27.918044+00'),
	('073af0c9-7383-4d1a-99ba-a8b68456fdae', '924dd171-e407-49ab-8902-570ac8d914a7', NULL, 'typescript/nebula-srv', '2026-06-18 05:07:27.963922+00'),
	('fdaaa495-80a7-4871-a2d9-5e3e2a669d73', '924dd171-e407-49ab-8902-570ac8d914a7', NULL, 'typescript/broker-client', '2026-06-18 05:07:28.013147+00'),
	('e374fa61-79c5-4b4d-9206-9f646eb4571b', '924dd171-e407-49ab-8902-570ac8d914a7', NULL, 'typescript/broker-gateway-proxy', '2026-06-18 05:07:28.054972+00'),
	('51def770-b15f-4f35-8cc9-3426bae333e5', '924dd171-e407-49ab-8902-570ac8d914a7', NULL, 'typescript/broker-service-proxy', '2026-06-18 05:07:28.099266+00'),
	('e92f4a54-511d-45b9-8a7f-3dcf436b836a', '924dd171-e407-49ab-8902-570ac8d914a7', NULL, 'typescript/file-system-server', '2026-06-18 05:07:28.138812+00'),
	('19960b43-9abd-4d90-9606-80b461381819', '924dd171-e407-49ab-8902-570ac8d914a7', NULL, 'typescript/image-server', '2026-06-18 05:07:28.169439+00'),
	('b0ec13ea-c637-47fb-ad38-9adb66c3811c', '924dd171-e407-49ab-8902-570ac8d914a7', NULL, 'typescript/mock-broker-service', '2026-06-18 05:07:28.205376+00'),
	('5a784ade-cdab-4842-9306-ddebf6ed80e1', '924dd171-e407-49ab-8902-570ac8d914a7', NULL, 'typescript/unsplash', '2026-06-18 05:07:28.235662+00'),
	('b1565b59-4045-4216-8af4-35d4fcdaeb82', '924dd171-e407-49ab-8902-570ac8d914a7', NULL, 'typescript/google', '2026-06-18 05:07:28.264998+00'),
	('0646f585-aa9c-41a3-9e1d-d6c30fbe3fc4', '4c07b12a-4d50-4bda-bdab-874965226603', NULL, 'python/cascade', '2026-06-18 05:07:28.319995+00'),
	('c98d0a8e-3646-4db3-8214-4ade78d7d771', '4c07b12a-4d50-4bda-bdab-874965226603', NULL, 'legacy/python/conduit', '2026-06-18 05:07:28.357955+00'),
	('0d80f814-c4d3-4af0-a62d-233959f9a282', '4c07b12a-4d50-4bda-bdab-874965226603', NULL, 'python/absorb/html', '2026-06-18 05:07:28.397443+00'),
	('df7e17e7-a9e9-40e4-bc0d-c1be0d6319cb', '4c07b12a-4d50-4bda-bdab-874965226603', NULL, 'python/fs/fs-crawler', '2026-06-18 05:07:28.435266+00'),
	('778e630c-c180-4b1d-8793-0fb9d3839b2b', '4c07b12a-4d50-4bda-bdab-874965226603', NULL, 'python/fs/fs-crawler-adapter', '2026-06-18 05:07:28.471212+00'),
	('6bc26bae-43a9-4d99-8f92-f56268ae7eca', '4c07b12a-4d50-4bda-bdab-874965226603', NULL, 'python/vision/losm-kernel', '2026-06-18 05:07:28.507362+00'),
	('5bb2f3cf-6512-4d20-8ba3-03b92a69b344', '4e90827e-9902-4d35-9438-9acc0158224d', NULL, 'jvm/spring/service-broker', '2026-06-18 05:07:28.56594+00'),
	('b6133cf1-cbfa-47f6-bfd1-fa3532012805', '4e90827e-9902-4d35-9438-9acc0158224d', NULL, 'jvm/spring/service-registry', '2026-06-18 05:07:28.609663+00'),
	('95d16639-16da-41c6-876f-af02577d3698', '4e90827e-9902-4d35-9438-9acc0158224d', NULL, 'jvm/spring/peb-kernel', '2026-06-18 05:07:28.651109+00'),
	('7b98c95f-74b4-46f0-9c62-0a2cb220c874', '4e90827e-9902-4d35-9438-9acc0158224d', NULL, 'jvm/spring/topology-server', '2026-06-18 05:07:28.69191+00'),
	('1c0a7cb8-e912-45ba-80f1-d9a0afca6f7d', '4e90827e-9902-4d35-9438-9acc0158224d', NULL, 'jvm/helidon', '2026-06-18 05:07:28.729596+00'),
	('6afc54db-3aff-468d-95dd-4f05406619c3', '4e90827e-9902-4d35-9438-9acc0158224d', NULL, 'jvm/helidon/user-access-service', '2026-06-18 05:07:28.764796+00'),
	('48cdde1d-a468-441a-b407-366f6111cde6', '4e90827e-9902-4d35-9438-9acc0158224d', NULL, 'jvm/quarkus', '2026-06-18 05:07:28.797961+00'),
	('6d8acadd-0010-4e29-8e3a-f6695b563428', '4e90827e-9902-4d35-9438-9acc0158224d', NULL, 'jvm/quarkus/broker-gateway', '2026-06-18 05:07:28.832499+00'),
	('132bb0c9-5d12-46ba-afa0-a84f3661dc2f', '4e90827e-9902-4d35-9438-9acc0158224d', NULL, 'jvm/shared/core', '2026-06-18 05:07:28.870728+00'),
	('a067e680-e86c-4e7f-b9cb-e6dd6123e7d4', '4e90827e-9902-4d35-9438-9acc0158224d', NULL, 'jvm/ballerina', '2026-06-18 05:07:28.90767+00'),
	('33d06441-b314-4c53-bf1d-61a4f7f6b698', 'a18d0460-ffdf-410c-a7f9-d150f302477a', NULL, 'go/wrp/ccnf-ref', '2026-06-18 05:07:28.963063+00'),
	('6988d0d5-d90e-4af9-8c4e-a282254df3fc', '534dab1a-5a34-47b4-af1e-8fcefd579423', NULL, 'rust/wrp/ccnf-verifier', '2026-06-18 05:07:29.018347+00'),
	('f7a0b226-0497-4d89-aed5-6ff585393a0a', '717e8d19-813b-4bad-9d8c-a849ad147fd2', NULL, 'moleculer/search', '2026-06-18 05:07:29.077088+00'),
	('6d3de0e7-cb07-41f8-8f4c-ddbd56cf08f9', 'b3be6007-7b61-47bb-85f9-335e80d7f50e', NULL, 'adonisjs/broker-gateway-proxy', '2026-06-18 05:07:29.1332+00'),
	('d7f9a761-5b8e-4692-a58d-267c08cd1f8d', '9ae9e43c-5f58-48cc-a008-08533f64c226', NULL, 'scripts/bash', '2026-06-18 05:07:29.203167+00'),
	('98e1e24e-d704-4657-b29f-85b645376d3b', '9ae9e43c-5f58-48cc-a008-08533f64c226', NULL, 'scripts/pwsh', '2026-06-18 05:07:29.239257+00'),
	('619b569a-ea2a-4d0e-afae-64498bf4d227', '9ae9e43c-5f58-48cc-a008-08533f64c226', NULL, '.agent/docs', '2026-06-18 05:07:29.276751+00'),
	('72538c4d-7922-4fbd-b2cf-2eca58a0f632', '9ae9e43c-5f58-48cc-a008-08533f64c226', NULL, '.agent/tests/cer-ccnf-conformance', '2026-06-18 05:07:29.311283+00'),
	('4f51a139-d71b-4256-acf2-accac5f07132', '88e953d0-7fdc-4188-8c9f-ca9737173796', NULL, '.', '2026-06-18 05:07:29.358049+00');


--
-- Data for Name: user_preferences; Type: TABLE DATA; Schema: nebula; Owner: -
--

INSERT INTO nebula.user_preferences VALUES
	('default', 'darkMode', 'true', '2026-06-18 05:11:53.607255+00'),
	('default', 'sidebarWidth', '461', '2026-06-18 05:11:58.446363+00');


--
-- Data for Name: work_sessions; Type: TABLE DATA; Schema: nebula; Owner: -
--

INSERT INTO nebula.work_sessions VALUES
	('a6000000-0000-0000-0000-000000000001', 'a3000000-0000-0000-0000-000000000001', 'subsystem', 'User Auth', 'Implementing OAuth login', 'Cursor', 'Claude 3.5 Sonnet', 'Initial implementation done', 'Completed', '2026-06-16 21:37:36.456339+00', '2026-06-16 21:37:36.456339+00');


--
-- PostgreSQL database dump complete
--

\unrestrict FMQaugY7feLpnmIOqyZR8u5DrV4RsYpxUrpbWPuwtFc8fb0cB5XeEzKypEx7XQC

