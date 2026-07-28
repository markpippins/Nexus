# Conduit UI — Specification

## Overview

The Conduit UI is an Angular-based dashboard for monitoring and managing the Nexus Work Request Pipeline.

## Functional Requirements

- Display real-time pipeline state (queued, active, completed, failed)
- Provide WorkRequest creation and editing forms
- Support dark/light theme toggling
- Show agent assignment and status

## Non-Functional Requirements

- Page load time under 2 seconds
- Real-time updates via Server-Sent Events
- Responsive layout for desktop and tablet

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | /api/pipeline/state | Current pipeline state |
| GET | /api/work-requests | List WorkRequests |
| POST | /api/work-requests | Create WorkRequest |

## Data Model

- WorkRequest: id, type, status, priority, createdAt, assignedAgent
- PipelineState: queued[], active[], completed[], failed[]
