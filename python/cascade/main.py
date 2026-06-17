"""main.py — Cascade orchestration loop.

Runs architect_agent, dispatcher, and update_tasks
as subprocesses on a 2-second cadence.

Each subprocess manages its own NATS sidecar lifecycle
(start → publish → drain → close).
"""

import subprocess
import time

while True:
    subprocess.call(["python3", "agents/architect_agent.py"])
    subprocess.call(["python3", "handlers/dispatcher.py"])
    subprocess.call(["python3", "projections/update_tasks.py"])
    time.sleep(2)  # repeat every 2 seconds
