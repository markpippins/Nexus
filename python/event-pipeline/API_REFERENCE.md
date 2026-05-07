# Nexus event-pipeline - API Reference

This document details every module, class, and method within the `event-pipeline` package.

## Module: `agents/architect_agent.py`

### Function: `read_offset()`
### Function: `write_offset(timestamp, processed_ids)`
### Function: `build_workflow_steps(vocabulary)`
### Function: `process_event(event)`
## Module: `agents/llm.py`

### Function: `call_ollama(prompt, model, temperature)`
> Send a prompt to Ollama and return the parsed JSON response. Returns (result_dict, error_string). On success, error is None. On failure, result is None and error is a message.

### Function: `_extract_json(text)`
> Extract JSON from text that may contain markdown code blocks.

### Function: `get_model_for_step(step_name)`
> Return the model to use for a given step.

### Function: `check_ollama()`
> Check if Ollama is running. Returns (True, models_list) or (False, error).

### Function: `warmup_model(model)`
> Warm up a model by sending a lightweight prompt. Returns (True, None) on success, (False, error) on failure. Already-warmed models are skipped.

### Function: `warmup_all()`
> Warm up all models in MODEL_MAP.

## Module: `agents/step_generator.py`

### Function: `generate_for_step(step_name, context)`
> Generate artifact content for a workflow step using Ollama. Args: step_name: One of 'vocabulary', 'requirements', 'typespec', 'refactor' context: Dict with keys like 'idea', 'vocabulary', 'requirements', etc. Returns: (result_dict, error_string)

## Module: `handlers/__init__.py`

## Module: `handlers/base.py`

### Class: `StepHandler`
> Base class for workflow step handlers. Subclasses implement handle().

- **Method**: `__init__(idea_id, workflow_payload, artifact_dir)`
- **Method**: `_artifact_path(filename)`
- **Method**: `_write_artifact(filename, content)`
- **Method**: `_completion_event(artifact_path, payload_extra)`
- **Method**: `load_prior_artifact(filename, default)`
  - Load an artifact from a prior step for this idea_id.
- **Method**: `handle()`
  - Override to produce artifact and return completion event dict.

## Module: `handlers/dispatcher.py`

### Function: `_log(msg)`
### Function: `read_offset()`
### Function: `write_offset(timestamp, processed_ids)`
### Function: `load_workflow_for_idea(idea_id, events)`
> Find the WorkflowPlanned event for this idea_id.

### Function: `get_completed_steps(idea_id, events)`
> Return set of step names that have successful completion events.

### Function: `get_approved_steps(idea_id, events)`
> Return set of step names that have been approved by human.

### Function: `is_workflow_panicked(idea_id, events)`
> Check if a workflow has a KernelPanic event.

### Function: `write_event(evt_dict)`
> Write an event to the events directory. Returns the file path.

### Function: `emit_step_requested(idea_id, step_name)`
> Emit a StepRequested event for auto-advance.

### Function: `emit_rejection_event(idea_id, step_name, reason)`
> Write a StepRejected event.

### Function: `run_handler(idea_id, step_name, workflow, artifact_dir)`
> Execute a step handler and return the completion event.

### Function: `process_step_requested(event, events, new_events)`
> Process a StepRequested event. May add auto-advance events to new_events.

### Function: `run_dispatcher()`
> Main dispatcher entry point.

## Module: `handlers/steps.py`

### Function: `_log(idea_id, step, msg)`
### Function: `_load_failure_count(idea_id, artifact_dir)`
> Count consecutive failures for this step.

### Function: `_save_failure_count(idea_id, artifact_dir, counts)`
### Function: `_record_failure(idea_id, artifact_dir, step_name)`
### Function: `_reset_success(idea_id, artifact_dir, step_name)`
### Function: `_emit_kernel_panic(idea_id, output_dir, step_name, reason)`
> Emit a KernelPanic event and clear auto_advance.

### Class: `VocabularyHandler`
- **Method**: `handle()`

### Class: `RequirementsHandler`
- **Method**: `handle()`

### Class: `TypeSpecHandler`
- **Method**: `handle()`

### Class: `CompileHandler`
- **Method**: `handle()`
- **Method**: `_write_compile_logs(sandbox, stdout, stderr)`
  - Copy compile stdout/stderr to artifact logs.
- **Method**: `_emit_compile_failure(error_summary, artifact_path)`

### Class: `RefactorHandler`
- **Method**: `handle()`

### Class: `IntegrateHandler`
- **Method**: `handle()`
- **Method**: `_gather_current_state()`
  - Collect all existing artifact content as baseline.
- **Method**: `_build_proposed_state()`
  - Build the proposed new state from compiled artifacts + refactor plan.
- **Method**: `_generate_patch(current, proposed)`
  - Generate a unified diff between current and proposed state.
- **Method**: `_write_patch(patch_content)`
  - Write the patch file to artifacts/<idea_id>/integrate.patch.
- **Method**: `_summarize_changes(current, proposed)`
  - Produce a human-readable summary of what changed.

## Module: `handlers/vocabulary.py`

### Class: `VocabularyHandler`
- **Method**: `handle()`

## Module: `main.py`

## Module: `projections/update_tasks.py`

## Module: `prompts/templates.py`

### Function: `vocabulary_prompt(idea, existing_vocabulary)`
### Function: `requirements_prompt(idea, vocabulary)`
### Function: `typespec_prompt(idea, requirements, vocabulary)`
### Function: `refactor_prompt(idea, compiled_artifact, existing_code_context)`
## Module: `validators/events.py`

### Function: `validate_event(evt)`
> Validate an event dict. Returns (is_valid, error_message).

## Module: `validators/loader.py`

### Function: `load_events(event_dir)`
> Load all .json events from the directory, skipping invalid ones. Returns (valid_events, errors) where errors is a list of (filename, error_msg).

