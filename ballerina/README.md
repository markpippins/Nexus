# Nexus Ballerina Layer

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
- MCP server gateways
- AI tool orchestration endpoints
- Webhook ingestion services
- External observability exporters
- Automation pipelines

---

## Non-Goals

This directory is **not**:

- a rewrite of Nexus
- a mandatory runtime dependency
- the primary orchestration engine
- a replacement for Nexus services

Nexus must remain functional even if this entire folder disappears.

---

## Long-Term Vision

Nexus evolves into:

- a stable service platform kernel
- surrounded by interchangeable integration layers
- capable of operating across many ecosystems without coupling to any

Ballerina currently serves as the preferred implementation technology for that boundary.

The moat exists so the core can stay small, understandable, and durable.

---

## Status

Exploratory but intentional.

Expect experimentation, small proofs of concept, and evolving patterns.
Stability is less important here than learning how best to protect Nexus Core from integration complexity.

