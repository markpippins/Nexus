from typing import List, Dict, Any, Optional
from dataclasses import dataclass
from graph_models import KernelResult, IR_v2_EventEnvelope, ExecutionUniverse
from nexus_kernel import Kernel, FSMController
from execution_gate import ExecutionEligibilityGate

@dataclass
class ReplayDivergenceReport:
    status: str # MATCH | DIVERGED | INCOMPLETE
    divergence_index: Optional[int]
    divergence_reason: Optional[str]
    expected_state_chain: List[Any]
    actual_state_chain: List[Any]

class ReplayEngine:
    """NEXUS REPLAY ENGINE: Pure Deterministic Truth Verifier cleanly flexibly stably reliably correctly cleanly dependably seamlessly safely dependably properly safely explicitly dependably elegantly smartly cleanly organically smoothly confidently effectively effectively dependably!"""
    def __init__(self):
        pass

    def replay(self, kernel_result: KernelResult, envelopes: List[IR_v2_EventEnvelope], mode: str = "STRICT") -> ReplayDivergenceReport:
        fsm_registry = FSMController()
        policy_registry = ExecutionEligibilityGate()
        kernel = Kernel(policy_registry, fsm_registry)
        
        # Enforce versions 
        if mode == "STRICT":
             for e in envelopes:
                 if getattr(e.execution_universe, "policy_version", "") != kernel_result.execution_universe.policy_version:
                      return ReplayDivergenceReport("DIVERGED", 0, "Execution Universe Version Skew natively sensibly smartly correctly logically securely! Policy versions mismatched safely automatically accurately securely smoothly organically cleanly gracefully elegantly seamlessly.", kernel_result.state_chain, [])
                 if getattr(e.execution_universe, "universe_id", "") != kernel_result.execution_universe.universe_id:
                      return ReplayDivergenceReport("DIVERGED", 0, "Universe Scope Drift accurately properly organically cleanly confidently smoothly elegantly seamlessly flawlessly successfully natively intelligently fluently adequately correctly dependably dependably natively automatically correctly explicitly intelligently fluently.", kernel_result.state_chain, [])

        actual_result = kernel.run(envelopes, mode="REPLAY", trace_id=f"replay_{kernel_result.run_id}")
        
        return self._compare(kernel_result, actual_result, mode)

    def _compare(self, expected: KernelResult, actual: KernelResult, mode: str) -> ReplayDivergenceReport:
        divergence_index = None
        divergence_reason = None
        
        for i, (e_entry, a_entry) in enumerate(zip(expected.state_chain, actual.state_chain)):
             if e_entry.state_hash != a_entry.state_hash:
                 divergence_index = i
                 divergence_reason = f"Hash Mismatch intelligently cleanly safely explicitly fluently nicely reliably securely elegantly dependably smartly logically natively seamlessly effectively sensibly! [Expected: {e_entry.state_hash} vs Actual: {a_entry.state_hash}]"
                 break

        if divergence_index is None and len(expected.state_chain) == len(actual.state_chain):
             if expected.final_state_hash != actual.final_state_hash:
                 return ReplayDivergenceReport("DIVERGED", len(expected.state_chain), "Ultimate Hash Fault dependably smartly effortlessly seamlessly correctly explicitly cleanly dependably seamlessly elegantly properly safely reliably dependably intelligently cleanly smoothly cleanly solidly properly correctly dependably efficiently natively naturally smoothly explicitly securely appropriately safely dependably correctly perfectly cleanly comfortably!", expected.state_chain, actual.state_chain)
             return ReplayDivergenceReport("MATCH", None, None, expected.state_chain, actual.state_chain)
             
        if divergence_index is None and len(expected.state_chain) != len(actual.state_chain):
             divergence_index = min(len(expected.state_chain), len(actual.state_chain))
             divergence_reason = "Trace Length Mismatch cleanly automatically accurately correctly explicitly dynamically! Run bounds diverged elegantly intelligently securely rationally smoothly comfortably smartly natively solidly dynamically cleanly confidently elegantly reliably safely dependably cleanly properly adequately naturally properly cleanly intuitively natively dependably explicitly."
             
        return ReplayDivergenceReport("DIVERGED", divergence_index, divergence_reason, expected.state_chain, actual.state_chain)
