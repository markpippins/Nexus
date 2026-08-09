#!/usr/bin/env python3
"""
Generate API.md files for all MCP servers under nexus/slash/.

For each MCP server (e.g. conduit-mcp → slash/conduit):
  - Create folder nexus/slash/<name>/
  - For each tool: create nexus/slash/<name>/<tool>/API.md
"""

import json, os, re, subprocess, sys
from pathlib import Path

SLASH = Path("/home/codex/dev/nexus/slash")
NEXUS = Path("/home/codex/dev/nexus")

# ── Live MCP servers to query ───────────────────────────────────────
LIVE_MCPS = {
    "conduit": 3100,
    "nebula": 3102,
    "tackle": 3400,
}

def query_live_mcp(name, port):
    """Query a live MCP server for its tool list via Streamable HTTP."""
    import urllib.request, urllib.error
    try:
        # Initialize
        req = urllib.request.Request(
            f"http://localhost:{port}/",
            data=json.dumps({"jsonrpc":"2.0","id":1,"method":"initialize",
                "params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"gen","version":"1"}}}).encode(),
            headers={"Content-Type":"application/json","Accept":"application/json, text/event-stream"},
            method="POST"
        )
        resp = urllib.request.urlopen(req, timeout=5)
        body = json.loads(resp.read())
        sid = resp.headers.get("mcp-session-id","")

        # Notify
        if sid:
            req2 = urllib.request.Request(
                f"http://localhost:{port}/",
                data=json.dumps({"jsonrpc":"2.0","method":"notifications/initialized"}).encode(),
                headers={"Content-Type":"application/json","Accept":"application/json, text/event-stream",
                         "mcp-session-id":sid,"mcp-protocol-version":"2025-03-26"},
                method="POST"
            )
            urllib.request.urlopen(req2, timeout=5)

        # Tools list
        headers = {"Content-Type":"application/json","Accept":"application/json, text/event-stream"}
        if sid:
            headers["mcp-session-id"] = sid
            headers["mcp-protocol-version"] = "2025-03-26"

        req3 = urllib.request.Request(
            f"http://localhost:{port}/",
            data=json.dumps({"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}).encode(),
            headers=headers, method="POST"
        )
        resp3 = urllib.request.urlopen(req3, timeout=5)
        data = json.loads(resp3.read())
        tools = data.get("result",{}).get("tools",[])
        return tools
    except Exception as e:
        print(f"  WARN: Could not query {name} on {port}: {e}")
        return []

# ── Parse TypeScript tools files ────────────────────────────────────

def parse_ts_tools_declarative(content):
    """Parse declarative toolDefinitions array: [{name, description, inputSchema}, ...]"""
    tools = []
    # Find each tool definition block: start with { name: "..." and extract full block
    # Strategy: find '{ name:' and then track braces to find the closing }
    i = 0
    while True:
        idx = content.find('{', i)
        if idx == -1:
            break
        # Check if this looks like a tool definition
        after_brace = content[idx+1:idx+200]
        name_match = re.match(r'\s*name:\s*"([^"]+)"', after_brace)
        if not name_match:
            i = idx + 1
            continue
        name = name_match.group(1)
        # Find matching closing brace
        depth = 0
        end = idx
        for j in range(idx, len(content)):
            if content[j] == '{':
                depth += 1
            elif content[j] == '}':
                depth -= 1
                if depth == 0:
                    end = j
                    break
        block = content[idx:end+1]

        # Extract description
        desc_match = re.search(r'description:\s*"([^"]*)"', block)
        description = desc_match.group(1) if desc_match else ""

        # Extract inputSchema (nested object)
        schema_match = re.search(r'inputSchema:\s*(\{)', block)
        schema = {"type": "object", "properties": {}}
        if schema_match:
            schema_start = schema_match.start(1)
            # Track braces within the schema
            sdepth = 0
            send = schema_start
            for j in range(schema_start, len(block)):
                if block[j] == '{':
                    sdepth += 1
                elif block[j] == '}':
                    sdepth -= 1
                    if sdepth == 0:
                        send = j
                        break
            schema_str = block[schema_start:send+1]
            schema_str = schema_str.replace("'", '"')
            schema_str = re.sub(r'(\w+):', r'"\1":', schema_str)
            try:
                schema = json.loads(schema_str)
            except:
                pass

        tools.append({"name": name, "description": description, "inputSchema": schema})
        i = end + 1

    return tools


def parse_ts_tools(filepath):
    """Crude parser: extract tool name, description, and zod params from TS source."""
    with open(filepath) as f:
        content = f.read()

    # Try declarative pattern first (assembly, address-tts, ui-tools)
    if 'toolDefinitions' in content:
        return parse_ts_tools_declarative(content)

    tools = []
    # Split on 'server.tool('
    parts = content.split('server.tool(')[1:]  # skip before first

    for part in parts:
        # Find the tool name
        name_match = re.match(r'\s*"([^"]+)"', part)
        if not name_match:
            continue
        name = name_match.group(1)

        # Find description
        rest = part[name_match.end():]
        desc_match = re.match(r'\s*,\s*"([^"]*)"', rest)
        description = desc_match.group(1) if desc_match else ""

        # Find params (z.object or zod schema)
        params = []
        if desc_match:
            schema_part = rest[desc_match.end():]
        else:
            schema_part = rest

        # Find z.object({ ... }) or {}
        obj_match = re.search(r'z\.object\(\{', schema_part)
        if obj_match:
            block = schema_part[obj_match.end():]
            # Find matching closing brace
            depth = 1
            end = 0
            for i, ch in enumerate(block):
                if ch == '{': depth += 1
                elif ch == '}':
                    depth -= 1
                    if depth == 0:
                        end = i
                        break
            obj_body = block[:end]

            # Extract param names from z.string(), z.number(), etc.
            param_pattern = r'(\w+)\s*:\s*z\.\w+\(\)'
            for pm in re.finditer(param_pattern, obj_body):
                pname = pm.group(1)
                if pname not in ('type','content'):  # skip common names
                    # Try to find .describe()
                    after = obj_body[pm.end():]
                    desc_m = re.search(r'\.describe\("([^"]*)"\)', after)
                    pdesc = desc_m.group(1) if desc_m else ""
                    params.append({"name": pname, "description": pdesc, "required": True})
        elif re.match(r'\s*,\s*\{\s*\}', schema_part):
            params = []

        tools.append({
            "name": name,
            "description": description,
            "inputSchema": {
                "type": "object",
                "properties": {p["name"]: {"type": "string", "description": p["description"]} for p in params},
                "required": [p["name"] for p in params if p["required"]]
            } if params else {"type": "object", "properties": {}}
        })

    return tools

# ── Parse Python MCP tools ──────────────────────────────────────────

def parse_py_tools(filepath):
    """Parse Python MCP server Tool definitions."""
    with open(filepath) as f:
        content = f.read()

    tools = []
    # Find Tool(name=...) blocks
    pattern = r'Tool\(\s*name\s*=\s*"([^"]+)"\s*,\s*description\s*=\s*"([^"]*)"\s*,\s*inputSchema\s*=\s*(\{[^}]+\})'
    for m in re.finditer(pattern, content, re.DOTALL):
        name = m.group(1)
        description = m.group(2)
        schema_str = m.group(3)
        try:
            # Fix single quotes to double for JSON
            schema_str = schema_str.replace("'", '"')
            schema = json.loads(schema_str)
        except:
            schema = {"type": "object", "properties": {}}
        tools.append({"name": name, "description": description, "inputSchema": schema})

    return tools

# ── Semantic tables (auto-generated tools) ──────────────────────────

SEMANTIC_TABLES = [
    "concept", "relationship_type", "evidence_type", "evidence_item",
    "source_observation", "asset_revision", "canonical_asset",
    "concept_relationship", "statement_evidence",
]

def semantics_tools():
    tools = []
    tools.append({
        "name": "semantics_meta",
        "description": "List all semantics domain tables with their row counts and available CRUD operations.",
        "inputSchema": {"type": "object", "properties": {}}
    })
    for table in SEMANTIC_TABLES:
        for op, desc in [("list", f"List all {table} records"), ("get", f"Get a single {table} by ID"),
                          ("add", f"Add a new {table} record"), ("update", f"Update an existing {table}"),
                          ("soft_delete", f"Soft-delete a {table} record")]:
            tools.append({
                "name": f"semantics_{op}_{table}",
                "description": desc,
                "inputSchema": {"type": "object", "properties": {}}
            })
    tools.append({
        "name": "semantics_resolve_drift_finding",
        "description": "Resolve a detected drift finding by marking it as acknowledged or fixed.",
        "inputSchema": {"type": "object", "properties": {}}
    })
    return tools

# ── Main generator ──────────────────────────────────────────────────

def write_api_md(server_name, tool):
    """Write a single API.md file."""
    folder = SLASH / server_name / tool["name"]
    folder.mkdir(parents=True, exist_ok=True)

    name = tool["name"]
    desc = tool.get("description", "")
    schema = tool.get("inputSchema", {})
    props = schema.get("properties", {})
    required = schema.get("required", []) if isinstance(schema.get("required"), list) else []

    lines = []
    lines.append("# Command")
    lines.append("")
    lines.append(f"/{server_name} {name}")
    lines.append("")

    lines.append("## Usage")
    lines.append("")
    lines.append(desc if desc else f"Calls the `{name}` tool on the {server_name}-mcp server.")
    lines.append("")

    lines.append("## Parameters")
    lines.append("")
    if props:
        lines.append("| Name | Type | Required | Description |")
        lines.append("|------|------|----------|-------------|")
        for pname, pinfo in sorted(props.items()):
            if isinstance(pinfo, dict):
                ptype = pinfo.get("type", "string")
                pdesc = pinfo.get("description", "")
            else:
                ptype = "string"
                pdesc = ""
            req = "Yes" if pname in required else "No"
            lines.append(f"| `{pname}` | {ptype} | {req} | {pdesc} |")
    else:
        lines.append("*No parameters required.*")
    lines.append("")

    lines.append("## Returns")
    lines.append("")
    lines.append("JSON object with the tool's response content.")
    lines.append("")

    lines.append("## Source")
    lines.append("")
    lines.append(f"- **MCP Server**: `{server_name}-mcp`")
    lines.append(f"- **Tool**: `{name}`")
    lines.append("")

    (folder / "API.md").write_text("\n".join(lines))

def main():
    all_servers = {}

    print("=== Querying live MCP servers ===")
    for name, port in LIVE_MCPS.items():
        tools = query_live_mcp(name, port)
        if tools:
            all_servers[name] = tools
            print(f"  {name}: {len(tools)} tools")

    print("\n=== Parsing TypeScript MCP servers ===")
    ts_servers = {
        "terrain": NEXUS / "typescript/terrain-mcp/src/tools/index.ts",
        "knowledge": NEXUS / "typescript/knowledge-mcp/src/tools/index.ts",
        "peb": NEXUS / "typescript/peb-mcp/src/tools/index.ts",
        "service-broker": NEXUS / "typescript/service-broker-mcp/src/tools/index.ts",
        "vision": NEXUS / "typescript/vision-mcp/src/tools/index.ts",
        "assembly": NEXUS / "typescript/assembly-mcp/src/tools.ts",
        "address-tts": NEXUS / "typescript/address-tts-mcp/src/tools.ts",
        "ui-tools": NEXUS / "typescript/ui-tools-mcp/src/tools.ts",
    }

    for name, path in ts_servers.items():
        if path.exists():
            tools = parse_ts_tools(str(path))
            if tools:
                if name not in all_servers:
                    all_servers[name] = tools
                print(f"  {name}: {len(tools)} tools")
        else:
            print(f"  {name}: NOT FOUND at {path}")

    print("\n=== Parsing Python MCP servers ===")
    py_vision = NEXUS / "python/vision-mcp/src/vision_mcp/main.py"
    if py_vision.exists():
        tools = parse_py_tools(str(py_vision))
        if tools:
            # Python vision-mcp overlaps with TS vision-mcp — merge into 'vision'
            if "vision" not in all_servers:
                all_servers["vision"] = tools
            print(f"  vision (python): {len(tools)} tools")

    print("\n=== Adding semantics (auto-generated) ===")
    all_servers["semantics"] = semantics_tools()
    print(f"  semantics: {len(all_servers['semantics'])} tools")

    print(f"\n=== Generating API.md files ===")
    total = 0
    for server_name, tools in sorted(all_servers.items()):
        server_dir = SLASH / server_name
        server_dir.mkdir(parents=True, exist_ok=True)
        for tool in tools:
            write_api_md(server_name, tool)
            total += 1
        print(f"  {server_name}: {len(tools)} API.md files")

    print(f"\n=== Done: {total} API.md files across {len(all_servers)} servers ===")

if __name__ == "__main__":
    main()
