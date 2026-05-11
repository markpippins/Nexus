Canonical Core for Nexus Polyglot Services

- This module contains language-agnostic core models that serve as the single source of truth for the platform.
- Adapters for Spring, Helidon, and Quarkus map between these canonical models and framework-specific DTOs.
- The goal is to incrementally migrate from com.angrysurfer.* packages to com.aibizarchitect.* while keeping a working system.

-How it works
- Core models live under com.aibizarchitect.nexus.core (BinaryData, ResponseError, PagedResponse).
- Adapters under java/adapters.* provide mappings and glue to each framework.
- Legacy code remains in place during migration and is marked deprecated to guide the transition.

Migration notes
- Start by wiring the canonical core into the Spring adapter (already scaffolded).
- Add similar adapters for Helidon and Quarkus when ready.
- Keep the core language-agnostic; avoid framework-specific types in core.
