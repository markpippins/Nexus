# Command

/nebula execution_create_request

## Usage

Create a new WorkRequest in the execution domain. Returns the created request with UUID id.

## Parameters

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `businessKey` | string | Yes | Unique business key (e.g. 'legacy-plan-0053' or 'wr-2026-07-12-001') |
| `deterministic` | boolean | No | Whether this is deterministic (default: true) |
| `inputs` | string | No | Intent inputs (any JSON) |
| `intentType` | string | No | Type of intent (default: 'task') |
| `maxRetries` | number | No | Max retry hint |
| `objective` | string | No | What is desired |
| `opTrace` | string | No | Op resolution trace |
| `resourceHints` | array<string> | No | Resource hints |
| `sourcePlanId` | string | No | Source conduit plan ID |
| `sourceWrId` | string | No | Source vision.work_requests.wr_id |
| `status` | string | No | Initial status (default: DRAFT) |
| `timeoutPolicy` | string | No | Timeout policy hint |
| `title` | string | No | Human-readable title |

## Returns

JSON object with the tool's response content.

## Source

- **MCP Server**: `nebula-mcp`
- **Tool**: `execution_create_request`
