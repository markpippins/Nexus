# Nexus WRP Daemon

The Work Request Pipeline (WRP) Daemon is the operational runtime substrate that bridges theoretical governance and actual execution. It watches a target project's `nexus/.conduit-data/WORK_REQUESTS/queued/` directory, bounds the work to a specific executor, and automatically triggers the code generation or mutation.

## How to Start the Daemon Manually

You can start the daemon manually from the terminal for any project that has been initialized with the pipeline.

### Prerequisites
Ensure the target project has a `.pipeline` structure. (e.g., you've run `pipeline-setup.sh` on it).

### Command
Run the daemon using Python 3 and pass the **absolute path** to the project you want it to watch:

```bash
# Example: Watching the sample-app project
python3 .agent/scripts/daemon_runtime.py --watch-project /home/codex/dev/nexus/sample-app
```

To run it in the background so it survives when you close the terminal, use `nohup`:

```bash
nohup python3 .agent/scripts/daemon_runtime.py --watch-project /home/codex/dev/nexus/sample-app > /tmp/nexus_daemon.log 2>&1 &
```

## How It Works

Once running, the daemon continuously polls every 5 seconds. When a `.json` file appears in the `queued/` directory, it will:
1. Validate governance constraints.
2. Lookup an executor in `.agent/config/executors.json` that supports the `type` of the WorkRequest.
3. Pass the WorkRequest to the executor (like `gemini-flash-builder`).
4. Await the execution receipt.
5. Move the WorkRequest to the `complete/` or `failed/` directory depending on the outcome.

To see what the daemon is doing, tail the log file:
```bash
tail -f /tmp/nexus_daemon.log
```
