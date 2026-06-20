"""Pipeline orchestration — wires all Phase 1 stations end-to-end.

Station sequence:
  0. AST parser + feature extractor  (ast_parser.parse → ast_features.extract_features)
  1. IRL classifier                   (irl_classifier.classify)
  2. IR resolver                      (ir_resolver.resolve)
  3. Spec compiler                    (spec_compiler.compile_selection)
  4. Lowering pass                    (lowering_pass.lower)
  5. Scheduler                        (scheduler.schedule)
  6. Replay engine                    (replay_engine.replay) — consumer, not inline

Station 0 (AST preprocessing) is optional.  For short prompts without
markdown structure, it gracefully degrades to the raw-text baseline.
"""

from __future__ import annotations

from meep.ast_parser import parse
from meep.ast_features import extract_features
from meep.irl_classifier import classify
from meep.ir_resolver import resolve
from meep.spec_compiler import compile_selection
from meep.lowering_pass import lower
from meep.scheduler import schedule
from meep.replay_engine import replay
from meep.models import CERLog, ExecutionState


def run_pipeline(prompt: str, use_ast: bool = True) -> CERLog:
    """Execute the full Phase 1 pipeline from *prompt* to *CERLog*.

    Args:
        prompt: Raw text prompt.
        use_ast: If True (default), run AST preprocessing (Station 0)
            before the IRL classifier. Set to False to use the raw-text
            baseline only.

    Returns:
        An append-only CER event log produced by executing the prompt.

    Raises:
        ValueError: If the pipeline encounters an invalid state.
    """
    # Station 0 — Optional AST preprocessing
    if use_ast:
        ast_doc = parse(prompt)
        ast_features = extract_features(ast_doc)
    else:
        ast_features = None

    # Station 1 — IRL classifier
    irl_result = classify(prompt, ast_features=ast_features)

    # Station 2 — IR resolver
    ir_selection = resolve(irl_result)

    # Station 3 — Spec compiler
    work_graph = compile_selection(ir_selection, prompt)

    # Station 4 — Lowering pass (freeze boundary)
    exec_graph = lower(work_graph)

    # Station 5 — Scheduler + CER writer
    cer_log = schedule(exec_graph)

    return cer_log


def run_and_replay(prompt: str, use_ast: bool = True) -> tuple[CERLog, ExecutionState]:
    """Run the full pipeline and replay the resulting event log.

    Returns:
        (CERLog, ExecutionState) tuple.
    """
    log = run_pipeline(prompt, use_ast=use_ast)
    state = replay(log)
    return log, state
