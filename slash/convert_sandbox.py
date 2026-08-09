#!/usr/bin/env python3
"""
Convert MySQL sandbox.sql to PostgreSQL.
Produces sandbox.pgsql — creates schemas, tables, indexes, FKs, and seed data.
"""

import re, sys

with open("/home/codex/dev/sandbox.sql") as f:
    content = f.read()

out = []
current_schema = None

# ── Helper: map MySQL types to PostgreSQL ───────────────────────────

def pg_type(mysql_col_def):
    """Convert a MySQL column definition to PostgreSQL."""
    col = mysql_col_def.strip()

    # AUTO_INCREMENT handling
    is_serial = 'AUTO_INCREMENT' in col.upper()
    col = re.sub(r'\bAUTO_INCREMENT\b', '', col, flags=re.IGNORECASE)

    # Type mappings
    col = re.sub(r'\bint\(\d+\)\s+unsigned\b', 'INTEGER', col, flags=re.IGNORECASE)
    col = re.sub(r'\bint\(\d+\)\b', 'INTEGER', col, flags=re.IGNORECASE)
    col = re.sub(r'\btinyint\(\d*\)\b', 'BOOLEAN', col, flags=re.IGNORECASE)
    col = re.sub(r'\bvarchar\(\d+\)\b', lambda m: m.group(0).upper(), col, flags=re.IGNORECASE)
    col = re.sub(r'\bfloat\b', 'REAL', col, flags=re.IGNORECASE)
    col = re.sub(r'\bdatetime\b', 'TIMESTAMPTZ', col, flags=re.IGNORECASE)
    col = re.sub(r'\bchar\(\d+\)\b', lambda m: m.group(0).upper(), col, flags=re.IGNORECASE)

    # DEFAULT CURRENT_TIMESTAMP → DEFAULT NOW()
    col = re.sub(r"DEFAULT CURRENT_TIMESTAMP", "DEFAULT NOW()", col, flags=re.IGNORECASE)

    # DEFAULT '9999-12-31 23:59:59' → add +00 timezone
    col = col.replace("DEFAULT '9999-12-31 23:59:59'", "DEFAULT '9999-12-31 23:59:59+00'")

    # NOT NULL DEFAULT '0' for booleans → DEFAULT false
    col = re.sub(r"NOT NULL DEFAULT '0'", "NOT NULL DEFAULT false", col)
    col = re.sub(r"NOT NULL DEFAULT '1'", "NOT NULL DEFAULT true", col)
    col = re.sub(r"DEFAULT '0'", "DEFAULT false", col)
    col = re.sub(r"DEFAULT '1'", "DEFAULT true", col)

    # Remove CHARACTER SET references
    col = re.sub(r'\s+CHARACTER SET \w+', '', col, flags=re.IGNORECASE)

    # Clean up extra whitespace
    col = re.sub(r'\s+', ' ', col).strip()

    return col


def convert_create_table(match):
    """Convert a MySQL CREATE TABLE to PostgreSQL."""
    table_name = match.group(1)
    body = match.group(2)

    if current_schema:
        qualified = f"{current_schema}.{table_name}"
    else:
        qualified = table_name

    lines = [f"CREATE TABLE IF NOT EXISTS {qualified} ("]

    # Parse column definitions and constraints
    # Split by comma, but be careful of nested parens
    parts = []
    depth = 0
    current = ""
    for ch in body:
        if ch == '(':
            depth += 1
        elif ch == ')':
            depth -= 1
        if ch == ',' and depth == 0:
            parts.append(current.strip())
            current = ""
        else:
            current += ch
    if current.strip():
        parts.append(current.strip())

    col_defs = []
    constraints = []
    indexes = []

    for part in parts:
        part = part.strip()
        if not part:
            continue

        # Remove backticks
        part = part.replace('`', '')

        # Detect constraint types
        upper = part.upper()
        if upper.startswith('PRIMARY KEY'):
            pk_cols = re.findall(r'PRIMARY KEY\s*\(([^)]+)\)', part, re.IGNORECASE)
            if pk_cols:
                cols = pk_cols[0]
                constraints.append(f"    PRIMARY KEY ({cols})")
            continue
        elif upper.startswith('UNIQUE KEY') or upper.startswith('UNIQUE '):
            # UNIQUE KEY name (cols)
            m = re.match(r'UNIQUE\s+(?:KEY\s+)?\w+\s*\(([^)]+)\)', part, re.IGNORECASE)
            if m:
                constraints.append(f"    UNIQUE ({m.group(1)})")
            continue
        elif upper.startswith('KEY ') or upper.startswith('INDEX '):
            m = re.match(r'(?:KEY|INDEX)\s+(\w+)\s*\(([^)]+)\)', part, re.IGNORECASE)
            if m:
                idx_name = m.group(1)
                idx_cols = m.group(2)
                indexes.append((idx_name, idx_cols, qualified, table_name))
            continue
        elif upper.startswith('CONSTRAINT'):
            m = re.match(r'CONSTRAINT\s+(\w+)\s+FOREIGN\s+KEY\s*\(([^)]+)\)\s+REFERENCES\s+(?:`?\w+`?\.)?`?(\w+)`?\s*\(([^)]+)\)\s*(.*)', part, re.IGNORECASE)
            if m:
                fk_name = m.group(1)
                fk_col = m.group(2)
                ref_table = m.group(3)
                ref_col = m.group(4)
                rest = m.group(5).strip()
                # If the ref was cross-db (e.g. elastic.query), schema-qualify it
                # Check if the reference was originally cross-database
                orig = part
                cross_db = re.search(r'REFERENCES\s+`(\w+)`\.`(\w+)`', orig)
                if cross_db:
                    ref_qualified = f"{cross_db.group(1)}.{cross_db.group(2)}"
                else:
                    ref_qualified = f"{current_schema}.{ref_table}" if current_schema else ref_table
                constraints.append(f"    CONSTRAINT {fk_name} FOREIGN KEY ({fk_col}) REFERENCES {ref_qualified} ({ref_col}){'' if not rest else ' ' + rest}")
            continue
        elif upper.startswith('FOREIGN KEY'):
            m = re.match(r'FOREIGN\s+KEY\s*\(([^)]+)\)\s+REFERENCES\s+(?:`?\w+`?\.)?`?(\w+)`?\s*\(([^)]+)\)\s*(.*)', part, re.IGNORECASE)
            if m:
                fk_col = m.group(1)
                ref_table = m.group(2)
                ref_col = m.group(3)
                rest = m.group(4).strip()
                orig = part
                cross_db = re.search(r'REFERENCES\s+`(\w+)`\.`(\w+)`', orig)
                if cross_db:
                    ref_qualified = f"{cross_db.group(1)}.{cross_db.group(2)}"
                else:
                    ref_qualified = f"{current_schema}.{ref_table}" if current_schema else ref_table
                constraints.append(f"    FOREIGN KEY ({fk_col}) REFERENCES {ref_qualified} ({ref_col}){'' if not rest else ' ' + rest}")
            continue

        # Regular column definition
        col_defs.append(f"    {pg_type(part)}")

    # Put it together
    all_defs = col_defs + constraints
    lines.append(",\n".join(all_defs))
    lines.append(")")

    # Add CREATE INDEX statements after the table
    idx_sql = ""
    for idx_name, idx_cols, qualified, tname in indexes:
        # Don't create indexes that duplicate PKs or UNIQUE constraints
        idx_sql += f"\nCREATE INDEX IF NOT EXISTS {idx_name} ON {qualified} ({idx_cols});"

    return "\n".join(lines) + idx_sql


def convert_insert(match):
    """Convert a MySQL INSERT to PostgreSQL."""
    table = match.group(1)
    columns = match.group(2)
    values = match.group(3)

    if current_schema:
        qualified = f"{current_schema}.{table}"
    else:
        qualified = table

    # Remove backticks
    cols_clean = columns.replace('`', '')
    # Convert boolean values: 0 → false, 1 → true for tinyint columns
    # We'll handle NULL properly too
    vals = values
    # Replace \' with '' for PG escaping
    vals = vals.replace("\\'", "''")
    # NULL stays NULL
    # Convert MySQL boolean literals
    vals = re.sub(r"(?<![\\'])\b0\b(?![\\'])", "false", vals)
    vals = re.sub(r"(?<![\\'])\b1\b(?![\\'])", "true", vals)
    # But be careful with strings like '103' — don't convert those
    vals = re.sub(r"(?<!\w)false\d+", lambda m: m.group(0).replace('false', '0'), vals)

    return f"INSERT INTO {qualified} ({cols_clean}) VALUES ({vals}) ON CONFLICT DO NOTHING;"


# ── Main conversion loop ────────────────────────────────────────────

out.append("-- Converted from MySQL sandbox.sql to PostgreSQL")
out.append("-- Generated by convert_sandbox.py")
out.append("")

# Process line by line
lines = content.split('\n')
i = 0
while i < len(lines):
    line = lines[i].strip()

    # Skip MySQL-specific comments and SET statements
    if line.startswith('/*!') or line.startswith('-- MySQL dump') or line.startswith('-- Host:'):
        i += 1
        continue
    if line.startswith('SET ') or line.startswith('LOCK TABLES') or line.startswith('UNLOCK TABLES'):
        i += 1
        continue
    if line.startswith('/*!40000 ALTER TABLE'):
        i += 1
        continue
    if line.startswith('-- Server version'):
        i += 1
        continue

    # CREATE DATABASE → CREATE SCHEMA
    db_match = re.match(r"CREATE DATABASE .*?`(\w+)`", line)
    if db_match:
        schema_name = db_match.group(1)
        out.append(f"CREATE SCHEMA IF NOT EXISTS {schema_name};")
        out.append("")
        i += 1
        continue

    # USE `db` → track current schema
    use_match = re.match(r"USE `(\w+)`", line)
    if use_match:
        current_schema = use_match.group(1)
        out.append(f"-- ══ Schema: {current_schema} ══")
        out.append("")
        i += 1
        continue

    # DROP TABLE IF EXISTS
    if line.startswith('DROP TABLE IF EXISTS'):
        table = re.findall(r'`(\w+)`', line)
        if table and current_schema:
            out.append(f"DROP TABLE IF EXISTS {current_schema}.{table[0]} CASCADE;")
        i += 1
        continue

    # CREATE TABLE — multi-line statement
    if 'CREATE TABLE' in line:
        # Collect the full CREATE TABLE statement
        stmt = [line]
        while i + 1 < len(lines) and ')' not in lines[i] and 'ENGINE=' not in lines[i]:
            i += 1
            stmt.append(lines[i])
        # Add more lines until we hit ENGINE=
        while i + 1 < len(lines) and 'ENGINE=' not in lines[i]:
            i += 1
            stmt.append(lines[i])

        full = '\n'.join(stmt)
        # Remove ENGINE=... and everything after the last )
        full = re.sub(r'\)\s*ENGINE=.*', ')', full, flags=re.IGNORECASE)
        # Remove AUTO_INCREMENT=...
        full = re.sub(r'AUTO_INCREMENT=\d+', '', full)
        # Remove DEFAULT CHARSET=...
        full = re.sub(r'DEFAULT CHARSET=\w+', '', full)

        # Parse table name and body
        m = re.search(r"CREATE TABLE\s+`(\w+)`\s*\((.*)", full, re.DOTALL | re.IGNORECASE)
        if m:
            result = convert_create_table(m)
            out.append(result + ";")
            out.append("")
        i += 1
        continue

    # INSERT INTO
    if line.startswith('INSERT INTO'):
        # Collect multi-line INSERT
        stmt = [line]
        while i + 1 < len(lines) and not lines[i].rstrip().endswith(';'):
            i += 1
            stmt.append(lines[i])

        full = ' '.join(stmt)
        m = re.match(r"INSERT INTO\s+`(\w+)`\s*\(([^)]+)\)\s*VALUES\s*\((.*)\);?", full, re.DOTALL)
        if m:
            result = convert_insert(m)
            out.append(result)
            out.append("")
        i += 1
        continue

    # Comments
    if line.startswith('--'):
        # Skip boring comments, keep schema/table structure comments
        if 'Current Database' in line or 'Table structure' in line or 'Dumping data' in line:
            out.append(line)
        i += 1
        continue

    # Skip empty lines
    i += 1

# Write output
output = '\n'.join(out)
with open("/home/codex/dev/sandbox.pgsql", "w") as f:
    f.write(output)

print(f"Converted: {len(output.split(chr(10)))} lines written to sandbox.pgsql")

# Count schemas and tables
schemas = set(re.findall(r'CREATE SCHEMA IF NOT EXISTS (\w+)', output))
tables = re.findall(r'CREATE TABLE IF NOT EXISTS (\w+\.\w+)', output)
inserts = len(re.findall(r'INSERT INTO', output))
print(f"Schemas: {len(schemas)} — {', '.join(sorted(schemas))}")
print(f"Tables: {len(tables)}")
print(f"INSERT statements: {inserts}")
