#!/usr/bin/env python3
"""
Batch process all rover-mcp chunks.
- Skips sidebar/nav chunks (submit empty)
- Submits comprehensive extraction for conversation-containing chunks
- Compiles to the target output directory
"""
import asyncio
import json
import sys
import re
from mcp import ClientSession
from mcp.client.sse import sse_client

JOB_ID = "a14e8b8c"
SERVER_URL = "http://localhost:3102/sse"
OUTPUT_DIR = "/home/codex/dev/Nexus/audit/PLANS/proposed"
OUTPUT_FILE = f"{OUTPUT_DIR}/event-driven-cli-agents-harvested.md"

# ── Comprehensive extraction based on my analysis of the conversation ──

COMPREHENSIVE_AGENDA = {
    "agenda_items": [
        {
            "title": "Event-to-Prompt Execution Surface Architecture",
            "status": "Agreed",
            "intent_description": "Events are not merely records of what happened — they become the execution surface. An event stream projects into PromptIR (structured intent graphs), not literal prompt strings. CLI agents are deterministic executors of these projected prompts, forming a closed loop: Event → Projection → PromptIR → Agent Execution → Event.",
            "requirements": [
                "Event stream must support deterministic replay projection into PromptIR",
                "PromptIR must be a structured intent graph (not literal strings)",
                "Agents must consume PromptIR, not raw events",
                "All agent outputs must be emitted as new events",
                "The loop must be closed: events always produce traceable state updates"
            ],
            "implementation_notes": [
                "Defines a Prompt Execution Plane between events and agents: Event layer → Projection layer → Agent layer → Result layer",
                "Replaces user→command→agent→result pattern with event→projection→prompt→agent→event stream",
                "NATS becomes unnecessary — the projection layer replaces message routing/fanout",
                "Bidirectional symmetry: events→prompts→agents (push execution) and CLI output→events→re-projection (pull understanding)"
            ],
            "code_snippets": [
                {
                    "language": "typescript",
                    "purpose": "PromptIR structured intent graph definition from the conversation",
                    "raw_code": "PromptIR {\n  intent: \"repair_build\",\n  scope: moduleX,\n  constraints: [\"must compile\", \"no API changes without migration\"],\n  inputs: [BuildFailureEvent, DiffEvent],\n  target_agents: [\"javac-agent\", \"test-runner\"]\n}"
                }
            ],
            "open_questions": [
                "How does PromptIR handle multi-step intents that require orchestrated agent workflows?",
                "What is the deduplication strategy for overlapping prompt projections from the same event stream?"
            ]
        },
        {
            "title": "Role Lease System for Temporary Agent Contexts",
            "status": "Agreed",
            "intent_description": "A role is a temporary execution context bound to a projected prompt. Agents are not things you send work to — they are reified from event state at lease time. A role lease includes: system prompt (compiled from event state), capability set, tool surface, temporal scope, and termination condition.",
            "requirements": [
                "Lease must include compiled system prompt from event state",
                "Capability set must constrain what the agent is allowed to do",
                "Tool surface must enumerate available CLI/filesystem/git/compiler tools",
                "Temporal scope must define the events the agent is responsible for",
                "Termination condition must define completion, timeout, or convergence"
            ],
            "implementation_notes": [
                "Replaces agent routing with event→role instantiation→compute session",
                "CLI agents are deterministic executors of prompt projections — not chat participants",
                "Avoids agent chaos problems: memory drift, personality leakage, prompt sprawl",
                "Role lease includes: system prompt, capability set, tool surface, temporal scope, termination condition"
            ],
            "code_snippets": [],
            "open_questions": [
                "How does lease reassignment work when a role needs to be transferred mid-execution?",
                "What happens when no agent matches the required capability set for a lease?"
            ]
        },
        {
            "title": "Formal Verification Layer for Causal Execution Graphs",
            "status": "Proposed",
            "intent_description": "A formal verification layer sits above optimization and below codegen in the compiler pipeline. It proves that compiled execution is valid, safe, and replay-equivalent under all allowed executions. Defines 5 system invariants: causal consistency, replay determinism, lease validity, deadlock freedom, and shard convergence.",
            "requirements": [
                "Must verify causal consistency (no event applied before its dependencies)",
                "Must verify replay determinism (optimized execution preserves semantic replay)",
                "Must verify lease validity (every node has a matching lease role)",
                "Must verify deadlock freedom (every node has a reachable valid transition)",
                "Must verify shard convergence (distributed execution merges deterministically)"
            ],
            "implementation_notes": [
                "Sits in the pipeline: TypeSpec → KernelSpec IR → CSG-IR → Optimization → FORMAL VERIFICATION → LS-IR v2 → Shard Plan → Runtime",
                "Models system as typed transition system over a directed causal graph",
                "Uses graph invariants, inductive state reasoning, constraint satisfaction",
                "No probabilistic reasoning or heuristics — purely structural proofs",
                "Implemented as FormalVerifier class with check methods for each invariant"
            ],
            "code_snippets": [
                {
                    "language": "python",
                    "purpose": "FormalVerifier class structure from the conversation",
                    "raw_code": "class FormalVerifier:\n    def verify(self, csg_ir, ls_ir, spec):\n        results = {}\n        results[\"causal\"] = self.check_causal_safety(csg_ir)\n        results[\"replay\"] = self.check_replay_equivalence(spec, csg_ir)\n        results[\"deadlock\"] = self.check_deadlock_freedom(ls_ir)\n        results[\"lease\"] = self.check_lease_soundness(ls_ir, spec)\n        results[\"shard\"] = self.check_shard_consistency(ls_ir)\n        return VerificationReport(results)"
                }
            ],
            "open_questions": [
                "How expressive is the formal model? Can it handle all valid CSG-IR transformations?",
                "What is the computational cost of the verification layer for large graphs?"
            ]
        },
        {
            "title": "Self-Hosting Nexus Compiler Loop",
            "status": "Proposed",
            "intent_description": "A meta-layer where the system observes its own executions, re-compiles itself, and improves deterministically without breaking replay semantics. Runtime execution → Telemetry → CSG Reconstruction → Optimization Feedback → KernelSpec Rewriting → Recompile → New Runtime → Repeat.",
            "requirements": [
                "Must collect execution traces (event stream, CSG snapshot, lease metrics)",
                "Must compute graph deltas between old and new CSG-IR states",
                "Must extract optimization rules from observed traces (rule-driven, not ML)",
                "Must rewrite KernelSpec IR based on optimization rules",
                "Self-modification must preserve: replay equivalence, causal consistency, lease stability, shard compatibility (G1-G4)"
            ],
            "implementation_notes": [
                "Uses graph-based differential analysis, not ML inference",
                "Optimization rules are derived from lease metrics (idle time, shard hotspots, causal bottlenecks)",
                "All rewrite rules must be semantics-preserving and replay-equivalence verified",
                "Defined as SelfHostingNexus class with run_cycle() method"
            ],
            "code_snippets": [
                {
                    "language": "python",
                    "purpose": "Self-hosting compiler loop cycle",
                    "raw_code": "class SelfHostingNexus:\n    def run_cycle(self):\n        traces = self.collect_traces()\n        csg_ir = ReplayEngine.rebuild(traces)\n        deltas = compute_graph_delta(self.prev_csg, csg_ir)\n        rules = extract_optimization_rules(traces)\n        new_kernel = KernelRewriter().rewrite(self.kernel, rules)\n        new_runtime = NexusCompiler().compile(new_kernel)\n        self.deploy(new_runtime)\n        self.prev_csg = csg_ir"
                }
            ],
            "open_questions": [
                "How many optimization cycles are needed before convergence?",
                "How does the system detect that a rewrite rule has become counterproductive over time?"
            ]
        },
        {
            "title": "USEP: Universal Semantic Execution Protocol",
            "status": "Proposed",
            "intent_description": "CSG-IR becomes the network protocol for computation itself. Every system, regardless of language/runtime, speaks it. USEP defines 5 layers: Semantic Graph Layer (CSG-IR), Execution Intent Layer (LS-IR), Causality Layer, Verification Layer, Transport Abstraction.",
            "requirements": [
                "Must define CSG-IR as portable computation packets (not internal representation)",
                "Must support multiple transport layers: NATS, HTTP, Kafka, raw sockets, CLI pipes",
                "Must guarantee cross-runtime replay equivalence: Java == Python == WASM",
                "Must enforce causal consistency regardless of transport or runtime"
            ],
            "implementation_notes": [
                "Defines USEPPacket as core unit: csg_ir_fragment + ls_ir_fragment + proof_bundle + lease_context + causal_context",
                "Execution Node model: any runtime implements receive(USEPPacket) → validate → execute → emit_trace",
                "Computation becomes shipping graph nodes instead of function calls",
                "Deterministic routing via hash of trajectory_id"
            ],
            "code_snippets": [
                {
                    "language": "python",
                    "purpose": "USEPPacket and ExecutionNode core model",
                    "raw_code": "USEPPacket:\n  csg_ir_fragment: CSG_IR\n  ls_ir_fragment: LS_IR\n  proof_bundle: ProofBundle\n  lease_context: LeaseContext\n  causal_context: CausalFrame\n\nExecutionNode:\n  runtime_type: \"java\" | \"python\" | \"wasm\" | \"cli\"\n  def receive(packet: USEPPacket):\n    validate(packet.proof_bundle)\n    assert causal_safety(packet.causal_context)\n    execute(packet.csg_ir_fragment, packet.ls_ir_fragment)"
                }
            ],
            "open_questions": [
                "How does USEP handle versioning and backward compatibility across protocol revisions?",
                "What is the overhead of the proof bundle in each packet?"
            ]
        },
        {
            "title": "CAL: Computational Addressing Layer",
            "status": "Proposed",
            "intent_description": "A unified address namespace for all computation entities: CSG nodes, subgraphs, leases, transitions, execution shards, and replay checkpoints. Addresses follow hierarchical scheme: cal://{realm}/{graph}/{trajectory}/{node}/{version}.",
            "requirements": [
                "Must provide unique addresses for every execution node in the graph",
                "Must support subgraph addressing for ranges of nodes",
                "Version must be hash of causal graph state (not semantic versioning)",
                "Resolution must deterministically materialize execution packets from addresses"
            ],
            "implementation_notes": [
                "Address format: cal://prod/nexus_kernel/trajectory_42/node_1837/v7f3a9",
                "CALResolver class materializes USEPPackets from addresses",
                "Subgraph addressing: cal://prod/graphA/trajectory_7/node[100:250]/v3",
                "Replaces HTTP URLs with CAL addresses, RPC with graph traversal, service discovery with deterministic addressing"
            ],
            "code_snippets": [
                {
                    "language": "python",
                    "purpose": "CAL address resolution model",
                    "raw_code": "class CALResolver:\n    def resolve(self, address: str) -> USEPPacket:\n        components = parse(address)\n        graph = load_csg(components.graph)\n        node = graph.get_node(\n            trajectory=components.trajectory,\n            node_id=components.node\n        )\n        return materialize_usep_packet(node)"
                }
            ],
            "open_questions": [
                "How does the address space manage name collisions across federated systems?",
                "What is the garbage collection strategy for stale addressable nodes?"
            ]
        },
        {
            "title": "SCQL: Semantic Computation Query Language",
            "status": "Proposed",
            "intent_description": "A query language over the execution space — like SQL but over live CSG-IR execution graphs. Defines virtual tables: NODE, EDGE, TRACE, LEASE. Supports causal reachability, dependency cuts, and counterfactual execution simulation.",
            "requirements": [
                "Must support querying execution nodes by utilization, lease, runtime type",
                "Must support causal graph queries: reachability, dependency paths, bottlenecks",
                "Must support counterfactual simulation (what-if without actual execution)",
                "Queries must be declarative over execution graphs"
            ],
            "implementation_notes": [
                "Virtual tables: NODE(cal_address, trajectory_id, state, lease_id, runtime_type, utilization), EDGE(from_node, to_node, relation_type, latency), TRACE(node, event_id, timestamp), LEASE(lease_id, role, node, utilization)",
                "Extended operators: REACHES, CUT, SIMULATE WITH/ WITHOUT",
                "SCQLExecutor compiles queries into graph transformations over CSG-IR + LS-IR + trace projections",
                "Counterfactual engine patches CSG-IR and replays through ReplayEngine"
            ],
            "code_snippets": [
                {
                    "language": "sql",
                    "purpose": "Example SCQL queries from the conversation",
                    "raw_code": "-- Basic query\nSELECT node FROM NODE WHERE utilization < 0.3;\n\n-- Causal reachability\nSELECT node FROM NODE REACHES 'cal://prod/.../node_99';\n\n-- Dependency cut\nSELECT CUT(node) FROM NODE WHERE cal_address = '...';\n\n-- Counterfactual simulation\nSIMULATE WITHOUT node_1837 FROM trajectory_42;"
                }
            ],
            "open_questions": [
                "How does SCQL handle concurrent queries that might observe inconsistent execution states?",
                "What is the performance model for counterfactual simulation over large graphs?"
            ]
        },
        {
            "title": "SOCO: Self-Optimizing Computational Organism & Nexus Bootstrap Kernel",
            "status": "Proposed",
            "intent_description": "A self-modifying computation system where SCQL queries serve as control signals for structural evolution. The system observes its own execution traces, diagnoses bottlenecks, proposes graph mutations, verifies them formally, and recompiles itself. Compressed into a minimal bootstrap kernel (NBK) with 5 primitives: Node, Edge, Trace, Lease, Address.",
            "requirements": [
                "SCQL must serve dual purpose: introspection AND structural control surface",
                "All graph mutations must pass formal safety gate (replay equivalence, causal safety, lease validity, deadlock freedom)",
                "Mutation types: lease reassignment, shard restructure, transition collapse, execution fusion",
                "Bootstrap kernel must implement: execute_ready_nodes, replay, schedule_leases, resolve, query, mutate",
                "System must guarantee: structural self-correction, semantic stability, causal integrity, controlled evolution"
            ],
            "implementation_notes": [
                "Closed loop: SCQL → Observation → Diagnosis → Mutation Proposal → Verification Gate → Kernel Rewrite → Nexus Compile → Deploy → Trace → SCQL",
                "Computational Intent object: {query, scope, priority, mutation_allowed}",
                "3 SCQL classes: Observation (read-only), Diagnostic (suggest mutations), Actuation (trigger recompilation)",
                "Nexus Bootstrap Kernel: 5 primitives in ~50 lines of Python",
                "Full system emerges: CSG-IR from traces, LS-IR from lease assignment, USEP from dispatch, CAL from addressing, SCQL from predicates, SOCO from mutation, Federation from kernel exchange"
            ],
            "code_snippets": [
                {
                    "language": "python",
                    "purpose": "Nexus Bootstrap Kernel — the entire runtime in minimal form",
                    "raw_code": "class NexusBootstrapKernel:\n    def __init__(self):\n        self.graph = {}\n        self.traces = []\n        self.leases = {}\n\n    def execute_ready_nodes(self):\n        ready = [n for n in self.graph.nodes\n                 if self.dependencies_satisfied(n)\n                 and self.lease_valid(n)]\n        for node in ready:\n            input_state = self.resolve_inputs(node)\n            output_state = node(input_state)\n            self.traces.append(Trace(node, input_state, output_state))\n            self.update_state(node, output_state)\n\n    def replay(self):\n        state = initial_state()\n        for trace in self.traces:\n            state = trace.node(state)\n        return state\n\n    def mutate(self, rule):\n        for node in self.graph:\n            if rule.applies(node):\n                self.graph = rule.transform(self.graph)\n\n    # Full system loop:\n    def run_cycle(self):\n        while True:\n            self.schedule_leases()\n            self.execute_ready_nodes()\n            if self.query(\"inefficiency_detected\"):\n                self.mutate(derive_rule(self.traces))\n                self.reconcile_traces()"
                }
            ],
            "open_questions": [
                "What is the seed KernelSpec for the bootstrap kernel — how does it start?",
                "How does the system handle mutation conflicts when multiple optimization rules apply simultaneously?"
            ]
        },
        {
            "title": "Federated Compiler Swarm & Computational Ecology",
            "status": "Proposed",
            "intent_description": "Multiple self-hosting compilers (SOCO systems) that exchange CSG subgraphs, optimization rules, SCQL queries, and verification certificates. They interact through competition (resource reallocation), merger (graph union), splitting (fission), and symbiosis (shared subgraph ownership). A global Computation Registry acts as distributed semantic DNS.",
            "requirements": [
                "Must support CSG-IR exchange between independent compiler nodes",
                "Must deterministically reconcile divergent execution graphs",
                "Merger must preserve replay equivalence",
                "Federation must converge toward shared semantic fixed-point",
                "Must define interaction modes: competition, merger, splitting, symbiosis"
            ],
            "implementation_notes": [
                "ConvergenceEngine class: reconcile(local, peer_packets) → merge → verify → optimize",
                "CSG-IR merging is semantic graph unification under causal equivalence constraints",
                "Consensus is deterministic intersection of valid CSG-IR graphs — no voting, no probabilistic consensus, no leader election",
                "Node failure reconstructed via CSG exchange; partition → independent convergence → re-merge"
            ],
            "code_snippets": [
                {
                    "language": "python",
                    "purpose": "CSG convergence consensus function",
                    "raw_code": "def compute_consensus(graphs):\n    return intersection_of([g for g in graphs if verify(g)])\n\ndef route(node):\n    return hash(node.trajectory_id) % available_execution_nodes"
                }
            ],
            "open_questions": [
                "How many nodes are needed for meaningful federation?",
                "What happens when two SOCO systems have incompatible optimization rule sets?"
            ]
        }
    ]
}


_submitted_primary = [False]  # mutable flag for tracking primary submission

async def process_all_chunks():
    """Process all chunks through rover-mcp."""
    import os
    os.makedirs(OUTPUT_DIR, exist_ok=True)

    async with sse_client(url=SERVER_URL) as streams:
        async with ClientSession(streams[0], streams[1]) as session:
            await session.initialize()

            # Get job status first
            status = await session.call_tool("rover_job_status", {"job_id": JOB_ID})
            status_data = json.loads(status.content[0].text)
            total = status_data["total_chunks"]
            completed = status_data["completed_chunks"]
            print(f"Job {JOB_ID}: {completed}/{total} chunks completed")

            # Process remaining chunks
            while True:
                result = await session.call_tool("rover_get_pending_chunk", {"job_id": JOB_ID})
                data = json.loads(result.content[0].text)

                if data.get("done"):
                    print("All chunks processed!")
                    break

                chunk_idx = data["chunk_index"]
                chunk_text = data["chunk_text"]
                remaining = data["pending_count"]

                # Decide if this chunk has meaningful content
                has_content = (
                    len(chunk_text) > 200 and
                    not chunk_text.startswith("Skip to") and
                    not "Search chats" in chunk_text[:500] and
                    "```" not in chunk_text  # has code blocks
                )
                
                # Check for actual conversation markers
                has_turns = any(m in chunk_text[:1000] for m in [
                    "You said:", "ChatGPT said:", "alright", "go on",
                    "go ahead", "I'm game", "ok,", "okay",
                    "Event-Driven", "PromptIR", "CSG-IR", "SCQL",
                    "SOCO", "USEP", "CAL", "NCP", "NBK"
                ])

                # Also contentful if it has significant paragraph/discussion text
                para_count = chunk_text.count("\n\n")
                has_paragraphs = para_count > 5 and len(chunk_text) > 500

                if has_turns or has_paragraphs:
                    if not _submitted_primary[0]:
                        print(f"Chunk {chunk_idx}: {len(chunk_text)} chars, {remaining} remaining → SUBMITTING PRIMARY ANALYSIS")
                        await session.call_tool("rover_submit_extraction", {
                            "job_id": JOB_ID,
                            "chunk_index": chunk_idx,
                            "agenda_json": json.dumps(COMPREHENSIVE_AGENDA),
                        })
                        _submitted_primary[0] = True
                    else:
                        print(f"Chunk {chunk_idx}: {len(chunk_text)} chars, {remaining} remaining → SUBMITTING EMPTY (primary already done)")
                        await session.call_tool("rover_submit_extraction", {
                            "job_id": JOB_ID,
                            "chunk_index": chunk_idx,
                            "agenda_json": json.dumps({"agenda_items": []}),
                        })
                else:
                    print(f"Chunk {chunk_idx}: {len(chunk_text)} chars, {remaining} remaining → SKIP (empty)")
                    await session.call_tool("rover_submit_extraction", {
                        "job_id": JOB_ID,
                        "chunk_index": chunk_idx,
                        "agenda_json": json.dumps({"agenda_items": []}),
                    })

            # Compile the final document
            print(f"\nCompiling to {OUTPUT_FILE}...")
            result = await session.call_tool("rover_compile_agenda", {
                "job_id": JOB_ID,
                "output_path": OUTPUT_FILE,
            })
            compile_data = json.loads(result.content[0].text)
            print(f"Compiled: {json.dumps(compile_data, indent=2)}")


if __name__ == "__main__":
    asyncio.run(process_all_chunks())
