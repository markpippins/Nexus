#!/usr/bin/env python3
"""
NBK CLI: Run causal computation graphs from the command line.

Usage:
    python3 -m nbk.cli run         # run an inline example
    python3 -m nbk.cli info        # show kernel state
    python3 -m nbk.cli dot         # emit DOT graph for visualization
"""

import argparse
import sys
import textwrap

from nbk import NexusBootstrapKernel


def build_example() -> NexusBootstrapKernel:
    """Build the canonical ETL pipeline example."""
    k = NexusBootstrapKernel(realm="dev", graph="example-etl")

    def extract(inputs):
        return {"rows": [1, 2, 3, 4, 5]}

    def transform(inputs):
        rows = inputs["extract"]["rows"]
        return [x * 10 for x in rows]

    def filter_positive(inputs):
        return [x for x in inputs["transform"] if x > 0]

    def sum_result(inputs):
        return sum(inputs["filter"])

    def report(inputs):
        total = inputs["sum"]
        return {"total": total}

    k.add_node("extract", extract)
    k.add_node("transform", transform)
    k.add_node("filter", filter_positive)
    k.add_node("sum", sum_result)
    k.add_node("report", report)

    k.add_edge("extract", "transform")
    k.add_edge("transform", "filter")
    k.add_edge("filter", "sum")
    k.add_edge("sum", "report")

    k.schedule_leases(executors=["etl-worker"])
    return k


def cmd_run(args: argparse.Namespace) -> int:
    k = build_example()
    n = k.execute_ready_nodes()
    print(f"Executed {n} nodes")
    print(f"Final state:  {k.node_states}")
    print(f"Traces:       {len(k.traces)}")
    print(f"Replay:       {k.replay()}")
    print(f"Snapshot:     {k.snapshot()}")
    return 0


def cmd_info(args: argparse.Namespace) -> int:
    k = build_example()
    print(f"Kernel:   {k.realm}/{k.graph}")
    print(f"Nodes:    {len(k.nodes)}")
    print(f"Edges:    {len(k.edges)}")
    for nid, nd in k.nodes.items():
        deps = k.dependencies(nid)
        depes = k.dependents(nid)
        print(f"  {nid}: deps={deps} → {depes}")
    return 0


def cmd_dot(args: argparse.Namespace) -> int:
    k = build_example()
    print("digraph NBK {")
    print('  rankdir="LR";')
    for nid in k.nodes:
        label = f"{nid}"
        print(f'  "{nid}" [label="{label}"];')
    for e in k.edges:
        print(f'  "{e.from_id}" -> "{e.to_id}";')
    print("}")
    return 0


def cmd_scql(args: argparse.Namespace) -> int:
    """Demonstrate SCQL-style queries on the kernel."""
    k = build_example()
    k.execute_ready_nodes()

    # All nodes
    print("=== All nodes ===")
    for row in k.query():
        print(f"  {row['node_id']:12s}  state={row['state']!r:20s}  "
              f"lease={row['lease']}")

    # Nodes with large state
    print("\n=== Nodes with state > 50 ===")
    big = k.query(predicate=lambda nid, nd, st: st is not None and (
        isinstance(st, (int, float)) and st > 50
        or isinstance(st, dict) and any(
            isinstance(v, (int, float)) and v > 50 for v in st.values()
        )
        or isinstance(st, list) and len(st) > 0
    ))
    for row in big:
        print(f"  {row['node_id']}")

    return 0


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Nexus Bootstrap Kernel — causal graph executor"
    )
    parser.set_defaults(func=lambda _: parser.print_help())

    sub = parser.add_subparsers(title="commands")
    sub.add_parser("run", help="Execute example pipeline").set_defaults(func=cmd_run)
    sub.add_parser("info", help="Show kernel graph structure").set_defaults(func=cmd_info)
    sub.add_parser("dot", help="Emit DOT graph").set_defaults(func=cmd_dot)
    sub.add_parser("scql", help="Run SCQL queries").set_defaults(func=cmd_scql)

    args = parser.parse_args()
    return args.func(args)


if __name__ == "__main__":
    sys.exit(main())
