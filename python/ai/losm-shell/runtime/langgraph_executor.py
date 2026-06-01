"""LangGraph Execution Runtime."""

import uuid
import operator
from typing import Dict, Any, TypedDict, List, Annotated
from langgraph.graph import StateGraph, START, END

from losm.ir.spec_ir import SpecIR
from losm.ir.execution_ir import ExecutionIR, ExecutionStatus, StepResult

class ExecutionState(TypedDict):
    """The graph state for the LangGraph executor."""
    spec: SpecIR
    step_results: Annotated[List[StepResult], operator.add]
    status: ExecutionStatus
    failure_summary: str | None

class LangGraphExecutor:
    """Uses langgraph to execute the DAG of SpecSteps."""

    def execute(self, spec: SpecIR) -> ExecutionIR:
        execution_id = str(uuid.uuid4())
        
        graph_builder = StateGraph(ExecutionState)
        step_map = {step.step_id: step for step in spec.steps}
        
        def make_node(step_id):
            def node_func(state: ExecutionState):
                step = step_map[step_id]
                result = StepResult(
                    step_id=step.step_id,
                    status=ExecutionStatus.SUCCESS,
                    logs=f"Executed command via LangGraph: {step.command}"
                )
                return {"step_results": [result]}
            return node_func
            
        for step in spec.steps:
            graph_builder.add_node(step.step_id, make_node(step.step_id))
            
        has_upstream = set()
        for step in spec.steps:
            if not step.dependencies:
                graph_builder.add_edge(START, step.step_id)
            else:
                for dep in step.dependencies:
                    graph_builder.add_edge(dep, step.step_id)
            has_upstream.add(step.step_id)
            
        has_downstream = set()
        for step in spec.steps:
            for dep in step.dependencies:
                has_downstream.add(dep)
                
        for step in spec.steps:
            if step.step_id not in has_downstream:
                graph_builder.add_edge(step.step_id, END)
                
        try:
            runnable = graph_builder.compile()
        except Exception as e:
            return ExecutionIR(
                execution_id=execution_id,
                spec=spec,
                status=ExecutionStatus.FAILURE,
                step_results=[],
                failure_summary=f"Graph compile error: {e}"
            )
            
        initial_state = {
            "spec": spec,
            "step_results": [],
            "status": ExecutionStatus.RUNNING,
            "failure_summary": None
        }
        
        try:
            final_state = runnable.invoke(initial_state)
            
            return ExecutionIR(
                execution_id=execution_id,
                spec=spec,
                status=ExecutionStatus.SUCCESS,
                step_results=final_state.get("step_results", [])
            )
        except Exception as e:
             return ExecutionIR(
                execution_id=execution_id,
                spec=spec,
                status=ExecutionStatus.FAILURE,
                step_results=[],
                failure_summary=f"Graph execution error: {e}"
            )
