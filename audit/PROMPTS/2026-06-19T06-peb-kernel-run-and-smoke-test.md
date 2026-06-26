---
project: nexus
date: 2026-06-19
session: peb-kernel-run-and-smoke-test
---

## Summary

User asked to bring up `mvn spring-boot:run` on `peb-bootstrap` against a Postgres and confirm `localhost:8080/api/v1/peb/transaction` is reachable end-to-end.

## Full Prompt

> Now that the kernel builds, try mvn spring-boot:run on peb-bootstrap — point it at a Postgres and confirm the REST facade at localhost:8080/api/v1/peb/transaction is reachable
