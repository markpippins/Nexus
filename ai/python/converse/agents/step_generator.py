"""LLM step executor: combines prompt templates with Ollama calls."""

import os, sys

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(BASE_DIR)
sys.path.insert(0, PROJECT_ROOT)

from prompts.templates import PROMPTS
from agents.llm import call_ollama, get_model_for_step


def generate_for_step(step_name, context):
    """Generate artifact content for a workflow step using Ollama.

    Args:
        step_name: One of 'vocabulary', 'requirements', 'typespec', 'refactor'
        context: Dict with keys like 'idea', 'vocabulary', 'requirements', etc.

    Returns:
        (result_dict, error_string)
    """
    if step_name not in PROMPTS:
        return None, f"No prompt template for step: {step_name}"

    # Build the prompt from template
    template = PROMPTS[step_name]
    prompt = template(**context)

    # Get the model for this step
    model = get_model_for_step(step_name)

    # Call Ollama
    result, error = call_ollama(prompt, model=model)
    if error:
        return None, error

    return result, None
