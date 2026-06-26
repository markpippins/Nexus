STRONTIUM TASK DAEMON SPEC (STDS v0.1)
0. Purpose

The Strontium Task Daemon is a persistent execution runtime that:

accepts structured tasks (not prompts)
executes them in bounded loops
maintains durable intermediate state
produces verifiable artifacts (files, logs, graphs, JSON outputs)
supports restart/resume without semantic loss

It is not an agent framework. It is a deterministic execution substrate with an LLM as a step function.

1. Core Architecture
           +----------------------+
           |  External Clients    |
           | (CLI / Nexus / API)  |
           +----------+-----------+
                      |
                      v
         +--------------------------+
         |   Task Ingestion Layer   |
         |  (HTTP / file / queue)  |
         +-----------+--------------+
                     |
                     v
         +--------------------------+
         |   Task Scheduler        |
         | (queue + prioritizer)   |
         +-----------+--------------+
                     |
                     v
         +--------------------------+
         | Execution Loop Engine    |
         | (STDS runtime core)      |
         +-----------+--------------+
                     |
         +-----------+------------+
         |                        |
         v                        v
+----------------+      +--------------------+
| LLM Executor   |      | Tooling Layer      |
| (Qwen3:4B)     |      | FS / Shell / APIs  |
+----------------+      +--------------------+
                     |
                     v
         +--------------------------+
         | State & Artifact Store   |
         | (files + JSON + logs)    |
         +--------------------------+
2. Task IR (Canonical Contract)

All work enters as a Task Envelope:

{
  "task_id": "uuid",
  "created_at": "timestamp",
  "priority": 0-10,

  "type": "analysis | transform | build | crawl | synthesize | repair",

  "objective": "human-readable intent",

  "constraints": {
    "max_steps": 50,
    "max_tokens_per_step": 4096,
    "time_budget_sec": 3600,
    "allowed_tools": ["fs", "shell", "http", "git"]
  },

  "context": {
    "inputs": [],
    "references": [],
    "working_directory": "/strontium/work/<task_id>/"
  },

  "expected_output": {
    "format": "json | files | report | mixed",
    "schema": null
  },

  "checkpoint_policy": {
    "frequency": "every_step | every_n_steps",
    "n": 3
  }
}
3. Execution Model (Critical)

Each task runs as a bounded loop:

for step in 0..max_steps:
    load_state()
    construct_prompt(task + state)
    call LLM
    parse action output
    execute tools (if any)
    write state checkpoint
    append log
    check termination condition
3.1 Step Output Format (STRICT)

The model MUST output structured step results:

{
  "status": "continue | complete | fail",
  "intent_update": "optional refinement of plan",
  "actions": [
    {
      "tool": "fs.write | shell.exec | http.get",
      "args": {}
    }
  ],
  "reasoning_summary": "short internal state summary",
  "artifacts_created": [],
  "next_focus": ""
}

No free-form responses are allowed at the execution layer.

4. State Model

Each task has persistent state:

{
  "task_id": "...",
  "step": 7,

  "memory": {
    "plan": [],
    "decisions": [],
    "observations": [],
    "errors": []
  },

  "artifacts": [
    {
      "id": "file/hash",
      "type": "file | log | json | graph",
      "path": "/work/.../artifact.json"
    }
  ],

  "last_llm_output": {},
  "status": "running | paused | completed | failed"
}

State is append-only where possible.

5. Checkpointing Rules

Checkpoint after:

every N steps (default 3)
any tool execution batch
any failure or retry
task completion

Checkpoint includes:

full state snapshot
last valid LLM output
tool execution results
error trace if present
6. Tooling Layer

Allowed tools are explicitly sandboxed:

6.1 File System Tool
{
  "tool": "fs.write",
  "args": {
    "path": "...",
    "content": "..."
  }
}
6.2 Shell Tool (restricted)
{
  "tool": "shell.exec",
  "args": {
    "cmd": "git status",
    "cwd": "..."
  }
}
6.3 HTTP Tool
{
  "tool": "http.get",
  "args": {
    "url": "..."
  }
}

No dynamic tool injection.

7. Scheduler Rules

Tasks are scheduled by:

priority_score =
  base_priority
  + aging_factor
  + dependency_unlock_bonus
  - failure_penalty

Execution is FIFO within priority bands.

8. Failure Model

Failures are classified:

recoverable → retry with modified prompt
terminal → mark failed, emit report
unknown → escalate to supervisor

Retry policy:

max_retries = 3
backoff = exponential
9. Completion Conditions

Task completes when:

status == "complete"
OR explicit completion signal in step output
OR max_steps reached (forced termination)

Completion requires:

final artifact bundle
execution summary
state snapshot
10. Supervisor Integration (Optional but powerful)

A higher-level system (Nexus / Titanium) can:

inject tasks
modify priorities
inspect state graphs
replay execution history
fork tasks into subgraphs

This is where your graph thinking actually plugs in cleanly.

11. Directory Layout (Strontium Node)
/strontium/
  daemon/
    stds.py
    scheduler.py
    executor.py

  tasks/
    <task_id>/
      task.json
      state.json
      log.ndjson
      artifacts/

  models/
    qwen3_4b/

  runtime/
    queue.db (or sqlite)
12. Minimal Runtime Loop (Conceptual)
while True:
    task = scheduler.next()

    state = load(task.id)

    prompt = build_prompt(task, state)

    output = llm.execute(prompt)

    parsed = validate(output)

    apply_actions(parsed.actions)

    update_state(task.id, parsed)

    if parsed.status == "complete":
        finalize(task.id)
