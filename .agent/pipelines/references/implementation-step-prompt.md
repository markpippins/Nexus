You are exiting the architectural planning phase.

You have accumulated multiple IMPLEMENTATION_PLAN documents representing evolving understanding of the system.

Your task is NOT to implement directly.

Your task is to compile the approved architecture into executable WorkRequests.

Instructions:

1. Treat all implementation plans as a single evolving design history.
2. Later plans supersede earlier plans where conflicts exist.
3. Preserve architectural intent and rationale from earlier plans when generating tasks.
4. Generate WorkRequests ONLY for the CURRENT BEST UNDERSTANDING of the system.
5. Do NOT reproduce historical plans.
6. Emit atomic WorkRequests suitable for .agent/scripts/executor.py.
7. Each WorkRequest must:

   * modify only one logical concern
   * operate within a clearly defined path
   * list explicit resources
   * contain imperative instructions
8. Order WorkRequests according to safe execution sequence.
9. Assume execution will occur asynchronously and incrementally.
10. Output ONLY valid WorkRequest JSON objects.

You are compiling architecture into execution.
