"""Nexus datasource adapter (cutover 07).

Optional adapter that reads a Nexus datasource (currently the `nexus`
database's `resolution` / `semantics` / `shrapnel` schemas) and produces the
SAME normalized SOLScript storage contract as the sol-native adapter. Because
both adapters return identical contract objects, the interpreter is agnostic to
which is plugged in — the parity guarantee tested by cutover 12.

Structurally mirrors SolNativeAdapter; only the source DSN differs. The
contract shapes are identical, so SOLScript never depends on Nexus schema
internals — it only ever sees SolStoragePort contract objects.
"""

from __future__ import annotations

from typing import Any, List, Optional

try:
    import asyncpg  # type: ignore[import-untyped]
except ImportError:  # pragma: no cover
    asyncpg = None  # type: ignore[assignment]

from .contract import (
    ContractAttribute,
    ContractConcept,
    ContractEvidence,
    ContractRelationship,
    ContractRevision,
    ContractShrapnelFact,
    ContractSubject,
)
from .sol_native import SolNativeAdapter


class NexusDatasourceAdapter(SolNativeAdapter):
    """Implements `SolStoragePort` against the Nexus datasource.

    Reuses SolNativeAdapter's query logic (identical source locations, verified
    in both sol and nexus) but is named and scoped as the Nexus datasource
    adapter. The contract output is byte-for-byte the same shape.
    """

    # No override needed: the source table locations for the contract surfaces
    # are identical in nexus and sol (verified). This subclass exists to:
    #   - name the adapter distinctly (nexus datasource),
    #   - be the seam where a nexus-specific adapter could diverge later if the
    #     overlap reconciliation report re-parents a source table.
    pass