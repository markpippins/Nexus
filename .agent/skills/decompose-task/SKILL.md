---
name: pipeline-decompose
description: Breaks large intent into sequential WorkRequests
---

## Rules
- must output ordered WorkRequest list
- each request must be independently executable
- no cross-request runtime dependencies unless encoded explicitly