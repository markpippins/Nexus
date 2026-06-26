---
project: nexus
session: 2026-06-19
---

# Move plans from graph/ to audit/ and design role→folder mapping

## Summary

- Move implementation plans from `nexus/graph/IMPLEMENTATION_PLANS/pending/` to `nexus/audit/IMPLEMENTATION_PLANS/pending/`
- Keep continuous records in `nexus/audit/PROMPTS` and `nexus/audit/RESPONSES`
- Add role-based behaviors so specific agents use/create their corresponding folders in `nexus/audit/`
- The scheme should work with all available harnesses/agent configurations
