"""
nexus_core — Shared architectural primitives for the Nexus WorkRequest Pipeline.

This package contains the WRP state machine, kernel data types, and harness
interfaces that both conduit (orchestrator) and tackle (inference runtime) depend on.

Sub-packages:
    nexus_core.wrp      — WRP state adjacency matrix, receipt-to-state mapping,
                          kernel data types (KernelDelta, KernelError, KernelResult,
                          KernelSnapshot).
    nexus_core.harness  — Harness interface enums (ExecutionMode, RoleMappingStrategy,
                          ArgumentType) and the generic HarnessLauncher CLI builder.

Architecture:
    nexus_core  <──  conduit (orchestrator)
    nexus_core  <──  tackle  (inference runtime)

    No internal dependency between conduit and tackle — both depend on nexus_core.
"""
