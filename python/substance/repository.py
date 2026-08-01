import uuid
from typing import Optional

import asyncpg

from .cache import invalidate_segset
from .db import get_pool

# Sentinel for "infinitely valid" — MUST match the NOT NULL DEFAULT on every table
# and the WHERE clause of every partial unique index.  If you change the DB
# default, update this constant AND every ON CONFLICT WHERE clause below.
# Postgres will reject the query if the ON CONFLICT predicate doesn't match
# the index, so mismatches fail loudly rather than silently.
_FOREVER = "9999-12-31 00:00:00+00"

# maps the public "domain_type" path segment to (join_table, fk_column)
_DOMAIN_TABLES: dict[str, tuple[str, str]] = {
    "candidates": ("nebula.candidate_segment_sets", "candidate_id"),
    "intent-records": ("nebula.intent_record_segment_sets", "intent_record_id"),
    "requirements": ("nebula.requirement_segment_sets", "requirement_id"),
}


def domain_table(domain_type: str) -> tuple[str, str]:
    try:
        return _DOMAIN_TABLES[domain_type]
    except KeyError:
        raise ValueError(f"unknown domain_type '{domain_type}'")


async def create_segment_set(
    name: Optional[str], description: Optional[str], metadata: dict
) -> asyncpg.Record:
    pool = get_pool()
    return await pool.fetchrow(
        """
        insert into nebula.segment_sets (name, description, metadata)
        values ($1, $2, $3::jsonb)
        returning id, name, description, status, metadata, created_at, updated_at
        """,
        name,
        description,
        metadata,
    )


async def get_segment_set(segment_set_id: uuid.UUID) -> Optional[asyncpg.Record]:
    pool = get_pool()
    return await pool.fetchrow(
        """
        select id, name, description, status, metadata, created_at, updated_at
        from nebula.segment_sets
        where id = $1 and valid_until > now()
        """,
        segment_set_id,
    )


async def update_segment_set(
    segment_set_id: uuid.UUID, fields: dict
) -> Optional[asyncpg.Record]:
    """Update in place — segment_sets has FK references so we cannot
    expire+INSERT (PK collision).  valid_from is bumped to now() to
    record when the current version was established."""
    if not fields:
        return await get_segment_set(segment_set_id)
    pool = get_pool()
    set_clauses: list[str] = []  # valid_from stays — it records first-valid time, updated_at tracks edits
    values: list = []
    for i, (col, val) in enumerate(fields.items(), start=1):
        if col == "metadata":
            set_clauses.append(f"metadata = ${i}::jsonb")
        else:
            set_clauses.append(f"{col} = ${i}")
        values.append(val)
    set_clauses.append("updated_at = now()")
    values.append(segment_set_id)
    query = f"""
        update nebula.segment_sets
        set {', '.join(set_clauses)}
        where id = ${len(values)} and valid_until > now()
        returning id, name, description, status, metadata, created_at, updated_at
    """
    return await pool.fetchrow(query, *values)


async def add_members(segment_set_id: uuid.UUID, members: list[dict]) -> None:
    """Upsert members.  If a current-valid row exists (partial-unique-index
    match), update it in place; otherwise a new current row is inserted."""
    if not members:
        return
    pool = get_pool()
    async with pool.acquire() as conn:
        async with conn.transaction():
            for m in members:
                # ON CONFLICT targets the partial unique index:
                #   uq_segment_set_members_current
                #     ON (segment_set_id, segment_id) WHERE valid_until = '9999-12-31'
                await conn.execute(
                    f"""
                    insert into nebula.segment_set_members
                        (segment_set_id, segment_id, ordinal, note, included)
                    values ($1, $2, $3, $4, true)
                    on conflict (segment_set_id, segment_id)
                        where valid_until = '{_FOREVER}'::timestamptz
                    do update set ordinal = excluded.ordinal,
                                  note = excluded.note,
                                  included = true
                    """,
                    segment_set_id,
                    m["segment_id"],
                    m["ordinal"],
                    m.get("note"),
                )
            await conn.execute(
                "update nebula.segment_sets set updated_at = now() where id = $1",
                segment_set_id,
            )
        # Invalidate cache after commit so next GET rebuilds from current DB state
        await invalidate_segset(segment_set_id)


async def exclude_member(segment_set_id: uuid.UUID, segment_id: uuid.UUID) -> None:
    """Soft-exclude: toggle included=false and close the validity window."""
    pool = get_pool()
    async with pool.acquire() as conn:
        async with conn.transaction():
            await conn.execute(
                """
                update nebula.segment_set_members
                set included = false, valid_until = now()
                where segment_set_id = $1 and segment_id = $2 and valid_until > now()
                """,
                segment_set_id,
                segment_id,
            )
            await conn.execute(
                "update nebula.segment_sets set updated_at = now() where id = $1",
                segment_set_id,
            )
        # Invalidate cache after commit so next GET rebuilds from current DB state
        await invalidate_segset(segment_set_id)


async def list_resolved_segments(segment_set_id: uuid.UUID) -> list[asyncpg.Record]:
    pool = get_pool()
    return await pool.fetch(
        """
        select
            ssm.segment_id,
            ssm.ordinal,
            ssm.note,
            sh.conversation_id,
            sh.start_block_index,
            sh.end_block_index,
            sh.segment_type,
            sh.title
        from nebula.segment_set_members ssm
        left join nebula.segments_history sh
            on sh.id = ssm.segment_id
           and sh.expiration_dt = '9999-12-31 23:59:59+00'::timestamptz
        where ssm.segment_set_id = $1
          and ssm.included = true
          and ssm.valid_until > now()
        order by ssm.ordinal
        """,
        segment_set_id,
    )


async def link_domain(
    domain_type: str, domain_id: uuid.UUID, segment_set_id: uuid.UUID, role: str
) -> None:
    """Link a domain object to a segment set.  If a current-valid link already
    exists the partial unique index catches it and we update in place."""
    table, fk_col = domain_table(domain_type)
    pool = get_pool()
    await pool.execute(
        f"""
        insert into {table} ({fk_col}, segment_set_id, role, active)
        values ($1, $2, $3, true)
        on conflict ({fk_col}, segment_set_id)
            where valid_until = '{_FOREVER}'::timestamptz
        do update set role = excluded.role, active = true
        """,
        domain_id,
        segment_set_id,
        role,
    )


async def unlink_domain(
    domain_type: str, domain_id: uuid.UUID, segment_set_id: uuid.UUID
) -> None:
    """Soft-unlink: toggle active=false and close the validity window."""
    table, fk_col = domain_table(domain_type)
    pool = get_pool()
    await pool.execute(
        f"update {table} set active = false, valid_until = now() "
        f"where {fk_col} = $1 and segment_set_id = $2 and valid_until > now()",
        domain_id,
        segment_set_id,
    )


async def list_domain_links(
    domain_type: str, domain_id: uuid.UUID
) -> list[asyncpg.Record]:
    table, fk_col = domain_table(domain_type)
    pool = get_pool()
    return await pool.fetch(
        f"""
        select segment_set_id, role, active
        from {table}
        where {fk_col} = $1 and active = true and valid_until > now()
        """,
        domain_id,
    )
