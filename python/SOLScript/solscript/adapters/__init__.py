"""Standalone SOLScript storage adapters (cutover 05/06/07/12).

- `contract`: normalized, schema-agnostic contract dataclasses + SolStoragePort.
- `sol_native`: SolNativeAdapter — reads the `sol` database directly.
- (planned) `nexus_datasource`: NexusDatasourceAdapter — reads a nexus datasource
  and produces the same contract.

The interpreter loads ONLY from SolStoragePort implementations, so SOLScript
runs standalone (no Nexus/resolution-table dependency) and the same contract
shapes give cross-database parity.
"""

from .contract import (
    ContractAttribute,
    ContractConcept,
    ContractEvidence,
    ContractRelationship,
    ContractRevision,
    ContractShrapnelFact,
    ContractSubject,
    SolStoragePort,
)
from .nexus_datasource import NexusDatasourceAdapter
from .sol_native import SolNativeAdapter

__all__ = [
    "ContractConcept",
    "ContractAttribute",
    "ContractRelationship",
    "ContractSubject",
    "ContractShrapnelFact",
    "ContractRevision",
    "ContractEvidence",
    "SolStoragePort",
    "SolNativeAdapter",
    "NexusDatasourceAdapter",
]