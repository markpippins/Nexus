import subprocess, time

while True:
    subprocess.call(["python3", "agents/architect_agent.py"])
    subprocess.call(["python3", "handlers/dispatcher.py"])
    subprocess.call(["python3", "projections/update_tasks.py"])
    time.sleep(2)  # repeat every 2 seconds
