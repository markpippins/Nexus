# Command

/nebula nebula_list_plans

## Usage

List implementation plans from nexus/graph/IMPLEMENTATION_PLANS/{pending,planning,proposed,completed}/. Returns metadata only — for full markdown body use nebula_get_plan.

## Parameters

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `status` | enum(pending,planning,proposed,completed,all) | No | Filter by status directory. Defaults to 'all' (all four directories). |

## Returns

JSON object with the tool's response content.

## Source

- **MCP Server**: `nebula-mcp`
- **Tool**: `nebula_list_plans`
