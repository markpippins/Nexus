#!/usr/bin/env bash
# run-peb-kernel.sh — peb-kernel systemd wrapper (Spring Boot, port 8080)
#
# WHY: `mvn -pl peb-bootstrap spring-boot:run` invoked with no lifecycle
# phase resolves sibling reactor modules (peb-domain, peb-store, peb-hash,
# peb-core, peb-adapters, peb-api) from the STALE jars installed in
# ~/.m2, not from freshly compiled target/classes. After any kernel source
# change, a plain unit restart therefore silently serves the previous
# build (observed 2026-08-03: kernel served pre-fix code until `mvn install`
# was run manually).
#
# FIX: install the reactor modules first (fresh jars into .m2), then run.
# Offline (-o) keeps restarts fast and hermetic; drop -o if a dependency
# is ever missing from the local repository.
set -euo pipefail

cd /home/codex/dev/nexus/jvm/spring/peb-kernel

/usr/bin/mvn -q -o \
  -pl peb-domain,peb-store,peb-hash,peb-core,peb-adapters,peb-api,peb-bootstrap \
  install -DskipTests

exec /usr/bin/mvn -o -pl peb-bootstrap spring-boot:run
