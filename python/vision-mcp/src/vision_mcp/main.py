"""MCP server for Vision LOSM — exposes vision schema tables as MCP tools.

Runs on stdio. Each tool uses losm-store models directly.
"""

from mcp.server import Server
from mcp.server.stdio import stdio_server
from mcp.types import Tool, TextContent

from losm_store import (
    SessionLocal, PlanningTask, Artifact,
    create_work_request, get_work_request_by_wr_id,
    update_work_request, delete_work_request, list_work_requests,
    list_all_branches, create_branch, list_all_artifacts,
)

server = Server("vision-mcp")


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# ── Tool definitions ────────────────────────────────────────────────────────

@server.list_tools()
async def list_tools() -> list[Tool]:
    return [
        Tool(
            name="vision_list_work_requests",
            description="List all active work requests",
            inputSchema={"type": "object", "properties": {}},
        ),
        Tool(
            name="vision_create_work_request",
            description="Create a new work request",
            inputSchema={
                "type": "object",
                "properties": {
                    "intent": {"type": "string", "description": "What the work request should accomplish"},
                    "constraints": {"type": "object", "description": "Optional constraints"},
                    "priority": {"type": "integer", "description": "Priority level (default 5)"},
                    "context_data": {"type": "object", "description": "Contextual data"},
                },
                "required": ["intent"],
            },
        ),
        Tool(
            name="vision_get_work_request",
            description="Get a single work request by wr_id (UUID)",
            inputSchema={
                "type": "object",
                "properties": {
                    "wr_id": {"type": "string", "description": "Work request UUID (business key)"},
                },
                "required": ["wr_id"],
            },
        ),
        Tool(
            name="vision_update_work_request",
            description="Partially update a work request by wr_id (UUID)",
            inputSchema={
                "type": "object",
                "properties": {
                    "wr_id": {"type": "string", "description": "Work request UUID"},
                    "intent": {"type": "string", "description": "New intent"},
                    "constraints": {"type": "object", "description": "New constraints"},
                    "priority": {"type": "integer", "description": "New priority"},
                    "context_data": {"type": "object", "description": "New context"},
                    "status": {"type": "string", "description": "New status (e.g. IN_PROGRESS, DONE, CANCELLED)"},
                },
                "required": ["wr_id"],
            },
        ),
        Tool(
            name="vision_delete_work_request",
            description="Delete a work request by wr_id (UUID)",
            inputSchema={
                "type": "object",
                "properties": {
                    "wr_id": {"type": "string", "description": "Work request UUID"},
                },
                "required": ["wr_id"],
            },
        ),
        Tool(
            name="vision_list_branches",
            description="List all branches, optionally filtered by wr_id",
            inputSchema={
                "type": "object",
                "properties": {
                    "wr_id": {"type": "string", "description": "Optional: filter by work request UUID"},
                },
            },
        ),
        Tool(
            name="vision_create_branch",
            description="Create a new branch off a work request",
            inputSchema={
                "type": "object",
                "properties": {
                    "wr_id": {"type": "string", "description": "Parent work request UUID"},
                    "label": {"type": "string", "description": "Human-readable branch label"},
                    "parent_branch_id": {"type": "string", "description": "Parent branch for forking"},
                    "fork_point": {"type": "string", "description": "Artifact ID where branch diverged"},
                },
                "required": ["wr_id"],
            },
        ),
        Tool(
            name="vision_list_artifacts",
            description="List all artifacts, optionally filtered by wr_id",
            inputSchema={
                "type": "object",
                "properties": {
                    "wr_id": {"type": "string", "description": "Optional: filter by work request UUID"},
                },
            },
        ),
        Tool(
            name="vision_create_artifact",
            description="Create a new artifact (plan, patch, spec, etc.)",
            inputSchema={
                "type": "object",
                "properties": {
                    "type": {"type": "string", "description": "Artifact type: PLAN, CRITIQUE, SPEC, EXECUTION, PATCH, SUMMARY"},
                    "content": {"type": "object", "description": "Artifact content (JSON)"},
                    "wr_id": {"type": "string", "description": "Associated work request UUID"},
                    "confidence": {"type": "number", "description": "Confidence score"},
                    "provenance": {"type": "object", "description": "Source tracking info"},
                    "parent_artifact_id": {"type": "string", "description": "Parent artifact for lineage"},
                    "template_metadata": {"type": "object", "description": "Templating metadata"},
                },
                "required": ["type", "content"],
            },
        ),
        Tool(
            name="vision_health",
            description="Check database connectivity",
            inputSchema={"type": "object", "properties": {}},
        ),
    ]


@server.call_tool()
async def call_tool(name: str, arguments: dict) -> list[TextContent]:
    db = next(get_db())
    try:
        if name == "vision_list_work_requests":
            wrs = list_work_requests(db)
            return [TextContent(type="text", text=str(wrs))]

        elif name == "vision_create_work_request":
            wr = create_work_request(
                db,
                intent=arguments["intent"],
                constraints=arguments.get("constraints"),
                priority=arguments.get("priority", 5),
                context_data=arguments.get("context_data"),
            )
            return [TextContent(type="text", text=str(wr))]

        elif name == "vision_get_work_request":
            wr = get_work_request_by_wr_id(db, arguments["wr_id"])
            if wr is None:
                return [TextContent(type="text", text=f"Work request {arguments['wr_id']} not found")]
            return [TextContent(type="text", text=str(wr))]

        elif name == "vision_update_work_request":
            wr = update_work_request(
                db,
                arguments["wr_id"],
                intent=arguments.get("intent"),
                constraints=arguments.get("constraints"),
                priority=arguments.get("priority"),
                context_data=arguments.get("context_data"),
                status=arguments.get("status"),
            )
            if wr is None:
                return [TextContent(type="text", text=f"Work request {arguments['wr_id']} not found")]
            return [TextContent(type="text", text=str(wr))]

        elif name == "vision_delete_work_request":
            deleted = delete_work_request(db, arguments["wr_id"])
            if not deleted:
                return [TextContent(type="text", text=f"Work request {arguments['wr_id']} not found")]
            return [TextContent(type="text", text=f"Work request {arguments['wr_id']} deleted")]

        elif name == "vision_list_branches":
            wr_id = arguments.get("wr_id")
            if wr_id:
                branches = list_all_branches(db, wr_id=wr_id)
            else:
                branches = list_all_branches(db)
            return [TextContent(type="text", text=str(branches))]

        elif name == "vision_create_branch":
            branch = create_branch(
                db,
                wr_id=arguments["wr_id"],
                label=arguments.get("label"),
                parent_branch_id=arguments.get("parent_branch_id"),
                fork_point=arguments.get("fork_point"),
            )
            return [TextContent(type="text", text=str(branch))]

        elif name == "vision_list_artifacts":
            wr_id = arguments.get("wr_id")
            if wr_id:
                artifacts = list_all_artifacts(db, wr_id=wr_id)
            else:
                artifacts = list_all_artifacts(db)
            return [TextContent(type="text", text=str(artifacts))]

        elif name == "vision_create_artifact":
            art = Artifact(
                type=arguments["type"],
                content=arguments["content"],
                wr_id=arguments.get("wr_id"),
                confidence=arguments.get("confidence"),
                provenance=arguments.get("provenance"),
                parent_artifact_id=arguments.get("parent_artifact_id"),
                template_metadata=arguments.get("template_metadata"),
            )
            db.add(art)
            db.commit()
            db.refresh(art)
            return [TextContent(type="text", text=str(art))]

        elif name == "vision_health":
            try:
                count = db.query(PlanningTask).count()
                return [TextContent(type="text", text=f"OK — {count} work request(s) in database")]
            except Exception as e:
                return [TextContent(type="text", text=f"UNHEALTHY: {e}")]

        else:
            raise ValueError(f"Unknown tool: {name}")
    finally:
        db.close()


async def main():
    async with stdio_server() as streams:
        await server.run(streams[0], streams[1], server.create_initialization_options())


if __name__ == "__main__":
    import asyncio
    asyncio.run(main())
