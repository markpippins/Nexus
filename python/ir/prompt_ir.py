"""PromptIR — executable prompt marshaled for a lease execution harness.

The third stage of the compilation pipeline: IntentGraph → PromptIR.
Marshals structured intent into a role-specific prompt ready for the
execution harness (LLM, CLI, or subprocess).
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any
import uuid


@dataclass(frozen=True)
class PromptIR:
    """Executable prompt marshaled for a lease harness.

    Attributes:
        prompt_id: Unique identifier.
        role: Which role this prompt is for.
        system_prompt: System-level instructions for the harness.
        task_description: What to do (derived from intent graph).
        context: Structured context from the intent graph.
        expected_output_schema: Optional JSON schema for output validation.
        constraints: List of constraint descriptions.
        tools: MCP tool names available to this lease.
    """

    prompt_id: str = field(default_factory=lambda: str(uuid.uuid4()))
    role: str = ""
    system_prompt: str = ""
    task_description: str = ""
    context: dict[str, Any] = field(default_factory=dict)
    expected_output_schema: dict[str, Any] | None = None
    constraints: list[str] = field(default_factory=list)
    tools: list[str] = field(default_factory=list)

    @classmethod
    def from_intent(cls, intent_graph: Any, role: Any) -> "PromptIR":
        """Compile an IntentGraph into a PromptIR for a specific role.

        Args:
            intent_graph: The IntentGraph to compile.
            role: RoleDefinition or role string.

        Returns:
            A PromptIR ready for the execution harness.
        """
        role_name = getattr(role, "role_name", str(role))
        nodes = getattr(intent_graph, "nodes", [])

        # v1: Simple concatenation of intent descriptions
        descriptions = []
        event_ids = []
        for node in nodes:
            descriptions.append(f"- {node.label}: {node.description}")
            event_ids.extend(getattr(node, "source_event_ids", []))

        task = "\n".join(descriptions) if descriptions else "No intents to execute"

        # Role-specific system prompt (v1: generic)
        system = f"You are acting as the {role_name}. Execute the following intents."

        # Role-specific tools (v1: stub)
        tools: list[str] = []
        role_caps = getattr(role, "default_capabilities", set())
        if "read:state" in role_caps:
            tools.append("state_view")
        if "write:state" in role_caps:
            tools.append("state_mutate")

        return cls(
            role=role_name,
            system_prompt=system,
            task_description=task,
            context={
                "intent_node_count": len(nodes),
                "source_event_ids": event_ids,
            },
            tools=tools,
        )
