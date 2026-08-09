#!/usr/bin/env python3
"""MySQL->PostgreSQL converter — statement-based approach."""
import re

SRC = "/home/codex/dev/sandbox.sql"
DST = "/home/codex/dev/sandbox.pgsql"

with open(SRC) as f:
    content = f.read()

# ── Split into per-database sections (first occurrence only) ──
parts = re.split(r'-- Current Database: `(\w+)`\n', content)
sections = {}
for i in range(1, len(parts), 2):
    db = parts[i]
    body = parts[i + 1] if i + 1 < len(parts) else ""
    if db not in sections:
        sections[db] = body

print(f"Databases: {list(sections.keys())}")

RESERVED = {"desc", "order", "group", "user", "table", "select", "from", "where"}

def pg_value(v):
    """Fix MySQL string escaping for PostgreSQL."""
    # MySQL \' -> PG '' (double single quote)
    v = v.replace("\\'", "''")
    # MySQL \" -> PG " (no backslash needed)
    v = v.replace('\\"', '"')
    return v

def pg_type(t):
    t = re.sub(r'\bAUTO_INCREMENT\b', '', t, flags=re.IGNORECASE).strip()
    t = re.sub(r'\bunsigned\b', '', t, flags=re.IGNORECASE).strip()
    t = re.sub(r'\btinyint\(\d*\)', 'BOOLEAN', t, flags=re.IGNORECASE)
    t = re.sub(r'\bint\(\d+\)', 'INTEGER', t, flags=re.IGNORECASE)
    t = re.sub(r'\bbigint\(\d+\)', 'BIGINT', t, flags=re.IGNORECASE)
    t = re.sub(r'\bsmallint\(\d+\)', 'SMALLINT', t, flags=re.IGNORECASE)
    t = re.sub(r'\bint\b', 'INTEGER', t, flags=re.IGNORECASE)
    t = re.sub(r'\bvarchar\(\d+\)', lambda m: m.group(0).upper(), t)
    t = re.sub(r'\bchar\(\d+\)', lambda m: m.group(0).upper(), t)
    t = re.sub(r'\bfloat\b', 'REAL', t, flags=re.IGNORECASE)
    t = re.sub(r'\bdouble\b', 'DOUBLE PRECISION', t, flags=re.IGNORECASE)
    t = re.sub(r'\bdatetime\b', 'TIMESTAMPTZ', t, flags=re.IGNORECASE)
    t = re.sub(r'\btimestamp\b', 'TIMESTAMPTZ', t, flags=re.IGNORECASE)
    t = re.sub(r'\btext\b', 'TEXT', t, flags=re.IGNORECASE)
    t = re.sub(r'\blongtext\b', 'TEXT', t, flags=re.IGNORECASE)
    t = re.sub(r'\bmediumtext\b', 'TEXT', t, flags=re.IGNORECASE)
    t = re.sub(r'\bjson\b', 'JSONB', t, flags=re.IGNORECASE)
    t = re.sub(r'\bdecimal\(', 'NUMERIC(', t, flags=re.IGNORECASE)
    t = re.sub(r'\benum\([^)]+\)', 'VARCHAR(255)', t, flags=re.IGNORECASE)
    return re.sub(r'\s+', ' ', t).strip()

def strip_bt(s):
    """Remove backticks, preserving reserved word quoting."""
    def repl(m):
        w = m.group(1)
        return f'"{w}"' if w.lower() in RESERVED else w
    return re.sub(r'`(\w+)`', repl, s)

def fix_default(col_def, pg_t):
    d = col_def
    d = re.sub(r"DEFAULT '0000-00-00 00:00:00'", "DEFAULT NULL", d)
    d = re.sub(r'DEFAULT CURRENT_TIMESTAMP(?:\(\d*\))?', 'DEFAULT NOW()', d, flags=re.IGNORECASE)
    if 'BOOLEAN' in pg_t:
        d = re.sub(r"DEFAULT '1'", "DEFAULT true", d)
        d = re.sub(r"DEFAULT '0'", "DEFAULT false", d)
        d = re.sub(r"DEFAULT 1\b", "DEFAULT true", d)
        d = re.sub(r"DEFAULT 0\b", "DEFAULT false", d)
    else:
        d = re.sub(r"(DEFAULT)\s+'(\d+(?:\.\d+)?)'", r"\1 \2", d)
    if 'TIMESTAMPTZ' in pg_t:
        d = re.sub(r"DEFAULT '(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})'",
                   r"DEFAULT '\1'::TIMESTAMPTZ", d)
    return d


def convert_ddl(ddl_text, schema, table_name):
    """Convert MySQL CREATE TABLE body (between parens) to PG DDL."""
    full_name = f"{schema}.{table_name}"
    lines = []
    pk_cols = []
    fk_defs = []

    for raw_line in ddl_text.split('\n'):
        line = raw_line.strip().rstrip(',')
        if not line or line.startswith('--'):
            continue

        # Skip non-DDL lines that might have leaked in
        if re.match(r'^(LOCK\s+TABLES|UNLOCK\s+TABLES|INSERT\s+INTO|/\*|SET\s+)', line, re.IGNORECASE):
            continue

        line = strip_bt(line)

        if line.upper().startswith('PRIMARY KEY'):
            m = re.search(r'\(([^)]+)\)', line)
            if m:
                pk_cols = [c.strip() for c in m.group(1).split(',')]
            continue
        if line.upper().startswith('KEY ') or line.upper().startswith('INDEX '):
            continue
        if line.upper().startswith('UNIQUE KEY'):
            m = re.match(r'UNIQUE KEY\s+(\w+)\s*\(([^)]+)\)', line, re.IGNORECASE)
            if m:
                lines.append(f'    CONSTRAINT {m.group(1)} UNIQUE ({m.group(2)})')
            continue
        if line.upper().startswith('CONSTRAINT') and 'FOREIGN KEY' in line.upper():
            # Fix cross-db refs: `elastic`.`query` → elastic.query
            fline = re.sub(r'`(\w+)`\.`(\w+)`', r'\1.\2', line)
            fk_defs.append(fline)
            continue

        # Column definition: name type [modifiers]
        m = re.match(r'(\w+|"[^"]*")\s+(.+)', line)
        if m:
            col_name = m.group(1)
            rest = m.group(2)
            type_match = re.match(r'(\S+(?:\([^)]*\))?)\s*(.*)', rest)
            if type_match:
                pg_t = pg_type(type_match.group(1))
                modifiers = type_match.group(2).strip()

                nn = 'NOT NULL' if re.search(r'\bNOT NULL\b', modifiers, re.IGNORECASE) else ''
                default = ''
                dm = re.search(r"DEFAULT\s+('[^']*'|\S+)", modifiers, re.IGNORECASE)
                if dm:
                    default = dm.group(0)

                col_def = f'    {col_name} {pg_t}'
                if nn:
                    col_def += f' {nn}'
                if default:
                    col_def += f' {default}'
                col_def = fix_default(col_def, pg_t)
                lines.append(col_def)

    if pk_cols:
        lines.append(f'    PRIMARY KEY ({", ".join(pk_cols)})')
    lines.extend(fk_defs)

    pg_body = ',\n'.join(lines)
    return f'DROP TABLE IF EXISTS {full_name} CASCADE;\nCREATE TABLE IF NOT EXISTS {full_name} (\n{pg_body}\n);'


def convert_insert(insert_text, schema, table_name, bool_cols):
    """Convert a MySQL INSERT statement to PG."""
    full_name = f"{schema}.{table_name}"

    # INSERT INTO `table` (cols) VALUES (v1,v2),(v3,v4);
    m = re.match(
        r"INSERT\s+INTO\s+`(\w+)`\s*\(([^)]+)\)\s*VALUES\s*(.+)",
        insert_text, re.DOTALL | re.IGNORECASE
    )
    if not m:
        return ""

    cols_str = m.group(2)
    vals_str = m.group(3).strip().rstrip(';')

    cols = [c.strip().strip('`') for c in cols_str.split(',')]
    cols = [f'"{c}"' if c.lower() in RESERVED else c for c in cols]

    # Fix boolean literals
    col_names = [c.strip().strip('`') for c in cols_str.split(',')]
    bool_positions = [i for i, c in enumerate(col_names) if c in bool_cols]

    if bool_positions:
        def fix_tuple(t):
            vals = [v.strip() for v in t.split(',')]
            for pos in bool_positions:
                if pos < len(vals):
                    v = vals[pos].strip("'\"")
                    # Any integer: 0 → false, anything else → true
                    if v.isdigit():
                        vals[pos] = 'false' if v == '0' else 'true'
                    elif v in ('1', 'true', 'TRUE'):
                        vals[pos] = 'true'
                    elif v in ('0', 'false', 'FALSE'):
                        vals[pos] = 'false'
            return ', '.join(vals)

        tuples = re.findall(r'\(([^)]+)\)', vals_str)
        fixed = [f'({fix_tuple(t)})' for t in tuples]
        vals_str = ',\n    '.join(fixed)

    cols_quoted = ', '.join(cols)
    # Fix MySQL escaping in values
    vals_str = pg_value(vals_str)
    return f'INSERT INTO {full_name} ({cols_quoted}) VALUES\n    {vals_str}\nON CONFLICT DO NOTHING;'


# ── View conversion ──

def convert_view_sql(sql):
    """Convert a single MySQL view SELECT statement to PG."""
    # Handle UNION: split and process each SELECT part
    parts = re.split(r'(\bunion\b)', sql, flags=re.IGNORECASE)
    result = []
    for part in parts:
        if part.upper().strip() == 'UNION':
            result.append('UNION')
            continue

        # Split at FROM
        sp = re.split(r'(\bfrom\b)', part, maxsplit=1, flags=re.IGNORECASE)
        if len(sp) != 3:
            result.append(part)
            continue

        select_part = sp[0] + sp[1]  # "select ... from"
        from_rest = sp[2]            # "joins where/order..."

        # Split from_rest at WHERE or ORDER BY to isolate the JOIN area
        tail_match = re.search(r'\b(where|order by)\b', from_rest, re.IGNORECASE)
        if tail_match:
            join_part = from_rest[:tail_match.start()]
            tail = from_rest[tail_match.start():]
        else:
            join_part = from_rest
            tail = ''

        # Strip parens from JOIN area only (preserve WHERE/IN parens)
        join_part = join_part.replace('(', '').replace(')', '')

        # Fix bare JOIN → CROSS JOIN (PG requires ON or CROSS)
        join_part = re.sub(
            r'(?<!cross\s)(?<!natural\s)(?<!left\s)(?<!right\s)(?<!inner\s)(?<!full\s)(?<!outer\s)\bjoin\b',
            'CROSS JOIN', join_part, flags=re.IGNORECASE)

        part = select_part + ' ' + join_part.strip() + ' ' + tail

        # Fix IN without parens: "in col1,col2" → "IN (col1, col2)"
        part = re.sub(
            r'\bin\s+([\w.]+)\s*,\s*([\w.]+)',
            r'IN (\1, \2)', part, flags=re.IGNORECASE)

        result.append(part)

    return ' '.join(result)


def convert_views(content):
    """Extract and convert all MySQL views from the dump."""
    # Find the "Final view structure" section
    final_start = content.find("USE `media`;\n\n--\n-- Final view structure")
    if final_start < 0:
        return ""
    final_end = content.find("--\n-- Current Database: `suggestion`", final_start)
    if final_end < 0:
        final_end = len(content)
    final_section = content[final_start:final_end]

    view_re = re.compile(
        r'/\*!50001 VIEW `(\w+)` AS (.+?)\*/;?',
        re.DOTALL
    )

    # Collect views by schema
    views_by_schema = {"media": [], "service": []}
    current_schema = "media"

    for m in view_re.finditer(final_section):
        name = m.group(1)
        sql = m.group(2).strip()

        # Remove backtick quoting
        sql = re.sub(r'`(\w+)`', r'\1', sql)

        # Convert MySQL→PG SQL
        sql = convert_view_sql(sql)

        # Detect schema from surrounding USE statements
        pre_text = final_section[:m.start()]
        if 'USE `service`' in pre_text:
            current_schema = "service"

        # Format with line breaks at major clauses
        sql_fmt = sql
        sql_fmt = re.sub(r'\bfrom\s+', '\n    FROM ', sql_fmt, flags=re.IGNORECASE)
        sql_fmt = re.sub(r'\bwhere\s+', '\n    WHERE ', sql_fmt, flags=re.IGNORECASE)
        sql_fmt = re.sub(r'\border by\s+', '\n    ORDER BY ', sql_fmt, flags=re.IGNORECASE)
        sql_fmt = re.sub(r'\bunion\b', '\nUNION\n  ', sql_fmt, flags=re.IGNORECASE)

        full_name = f"{current_schema}.{name}"
        view_sql = f'DROP VIEW IF EXISTS {full_name} CASCADE;\n'
        view_sql += f'CREATE OR REPLACE VIEW {full_name} AS\n'
        view_sql += f'{sql_fmt};'

        views_by_schema.setdefault(current_schema, []).append(view_sql)

    # Build output with SET search_path per schema
    out = []
    for schema in ["media", "service"]:
        if schema in views_by_schema and views_by_schema[schema]:
            out.append(f'\n-- Views: {schema}')
            out.append(f'SET search_path TO {schema}, public;')
            out.append('')
            for v in views_by_schema[schema]:
                out.append(v)
                out.append('')
            out.append('RESET search_path;')

    return '\n'.join(out)


# ── Main ──
output = []
output.append('-- Converted from MySQL sandbox.sql to PostgreSQL\n')

order = ["admin", "elastic", "analysis", "media", "service", "suggestion", "scratch"]

ct_re = re.compile(
    r"CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?`(\w+)`\s*\((.*?)\)\s*ENGINE=\w+[^;]*;",
    re.DOTALL | re.IGNORECASE
)
insert_re = re.compile(
    r"INSERT\s+INTO\s+`(\w+)`\s*\([^)]+\)\s*VALUES\s*.+?;",
    re.DOTALL | re.IGNORECASE
)

for schema in order:
    if schema not in sections:
        continue

    body = sections[schema]

    # Strip MySQL conditional comments and SET statements
    body = re.sub(r'/\*!5\d{4}.*?\*/;?\s*', '', body, flags=re.DOTALL)
    body = re.sub(r"SET @saved_cs_client.*?;\n", '', body)
    body = re.sub(r"SET character_set_client.*?;\n", '', body)
    body = re.sub(r"SET character_set_results.*?;\n", '', body)
    body = re.sub(r"SET collation_connection.*?;\n", '', body)
    body = re.sub(r"CREATE ALGORITHM=UNDEFINED.*?;", '', body, flags=re.DOTALL)
    body = re.sub(r"DROP VIEW IF EXISTS.*?;", '', body)
    body = re.sub(r"Final view structure.*?\n", '', body)
    body = re.sub(r'/\*!40000 ALTER TABLE.*?;', '', body, flags=re.DOTALL)
    body = re.sub(r'LOCK TABLES.*?;', '', body)
    body = re.sub(r'UNLOCK TABLES;', '', body)

    output.append(f'\n-- Schema: {schema}')
    output.append(f'CREATE SCHEMA IF NOT EXISTS {schema};')
    output.append(f'SET search_path TO {schema}, public;')
    output.append('')

    # Find all CREATE TABLE blocks
    ct_matches = list(ct_re.finditer(body))
    insert_matches = list(insert_re.finditer(body))

    # Map: table_name -> [(ddl_text, insert_texts)]
    tables = {}

    for m in ct_matches:
        tname = m.group(1)
        ddl_body = m.group(2)  # content between CREATE TABLE (...) and ENGINE=
        tables.setdefault(tname, [[], []])[0] = ddl_body

    for m in insert_matches:
        tname = m.group(1)
        if tname in tables:
            tables[tname][1].append(m.group(0))

    # ── Topological sort by FK dependencies ──
    # Build dependency graph: table -> [tables it depends on]
    deps = {}
    for tname, (ddl_body, _) in tables.items():
        refs = set()
        # Find REFERENCES `other_table` within same schema
        for ref in re.finditer(r'REFERENCES\s+`(\w+)`\s*\(', ddl_body, re.IGNORECASE):
            ref_table = ref.group(1)
            if ref_table != tname and ref_table in tables:
                refs.add(ref_table)
        # Also check cross-schema refs (but those are handled by schema ordering)
        deps[tname] = refs

    # Topological sort (Kahn's algorithm)
    sorted_tables = []
    remaining = set(tables.keys())
    while remaining:
        # Find tables with no remaining deps
        ready = {t for t in remaining if not (deps[t] & remaining)}
        if not ready:
            # Circular dependency or self-ref — just output remaining
            sorted_tables.extend(sorted(remaining))
            break
        sorted_tables.extend(sorted(ready))
        remaining -= ready

    for tname in sorted_tables:
        ddl_body, inserts = tables[tname]
        # Parse bool columns from DDL
        bool_cols = set()
        for cm in re.finditer(r'`(\w+)`\s+tinyint', ddl_body, re.IGNORECASE):
            bool_cols.add(cm.group(1))

        ddl_sql = convert_ddl(ddl_body, schema, tname)
        output.append(ddl_sql)
        output.append('')

        for ins in inserts:
            ins_sql = convert_insert(ins, schema, tname, bool_cols)
            if ins_sql:
                output.append(ins_sql)
                output.append('')

    output.append('RESET search_path;')

# ── Add views ──
view_sql = convert_views(content)
if view_sql:
    output.append('')
    output.append('-- ============================================================')
    output.append('-- Views')
    output.append('-- ============================================================')
    output.append(view_sql)

result = '\n'.join(output)
result = re.sub(r'\n{3,}', '\n\n', result)

with open(DST, 'w') as f:
    f.write(result)

print(f"Written {len(result)} chars to {DST}")

for s in order:
    if s in sections:
        tbls = len(re.findall(rf"CREATE TABLE IF NOT EXISTS {s}\.\w+", result))
        inserts = len(re.findall(rf"INSERT INTO {s}\.\w+", result))
        print(f"  {s}: {tbls} tables, {inserts} inserts")

# Count views
view_count = len(re.findall(r'CREATE OR REPLACE VIEW', result))
print(f"  views: {view_count}")
