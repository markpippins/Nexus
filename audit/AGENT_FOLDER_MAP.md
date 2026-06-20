# Agent Role → Audit Folder Mapping

Every agent role writes to and reads from specific subdirectories in
`nexus/audit/`. This file defines that mapping so agents know which folders
to use and which folders belong to other roles.

## Directory Layout

```
nexus/audit/
├── PROMPTS/           ← saved user prompts (origin)
├── RESPONSES/         ← saved agent responses (outcome)
├── PLANS/             ← high-level plans (Planner)
├── IMPLEMENTATION_PLANS/
│   ├── proposed/      ← ideas (Planner)
│   ├── planning/      ← being elucidated (Planner)
│   ├── pending/       ← ready to build (Builder)
│   └── completed/     ← finished (Reviewer)
├── ANALYSIS/          ← analysis reports (Analyst)
├── ARCHITECTURE/      ← architecture docs (Architect)
├── CHANGES/           ← change reports (Builder, Reviewer)
├── ENGINEERING/       ← engineering notes (Engineer)
├── HISTORY/           ← historical records (Archivist)
├── INSPECTIONS/       ← inspection/triage reports (Inspector, Critic, Analyst)
├── REQUIREMENTS/      ← requirements docs (Engineer)
├── SPECS/             ← specifications (Architect, Planner)
└── CROSS_REFERENCES.md
```

## Role→Folder Assignment

### planner
| Action | Folder |
|--------|--------|
| Write prompts | `PROMPTS/` |
| Write high-level plans | `PLANS/` |
| Propose implementation plans | `IMPLEMENTATION_PLANS/proposed/` |
| Elucidate plans | `IMPLEMENTATION_PLANS/planning/` |
| Analyze specifications | `ANALYSIS/specs/` |
| Write specs | `SPECS/` |
| Read responses | `RESPONSES/` |

### builder
| Action | Folder |
|--------|--------|
| Pick up pending plans | `IMPLEMENTATION_PLANS/pending/` |
| Mark plans in progress | `IMPLEMENTATION_PLANS/active/` |
| Write change reports | `CHANGES/committed/` |
| Write implementation responses | `RESPONSES/` |
| Read plans | `IMPLEMENTATION_PLANS/planning/`, `IMPLEMENTATION_PLANS/pending/` |

### reviewer
| Action | Folder |
|--------|--------|
| Validate completed plans | `IMPLEMENTATION_PLANS/completed/` |
| Approve change reports | `CHANGES/reviewed/` |
| Flag failed reviews | `CHANGES/flagged/` |
| Read builder output | `CHANGES/committed/` |

### critic
| Action | Folder |
|--------|--------|
| Write warning reports | `INSPECTIONS/warnings/` |
| Processed inspections | `INSPECTIONS/processed/` |
| Read plans and specs | `IMPLEMENTATION_PLANS/proposed/`, `SPECS/` |

### analyst
| Action | Folder |
|--------|--------|
| Triage issues | `INSPECTIONS/triage/` |
| Write analysis reports | `ANALYSIS/` |
| Read error/warning reports | `INSPECTIONS/errors/`, `INSPECTIONS/warnings/` |

### architect
| Action | Folder |
|--------|--------|
| Write architecture docs | `ARCHITECTURE/` |
| Write specifications | `SPECS/` |
| Read plans | `IMPLEMENTATION_PLANS/`, `PLANS/` |

### inspector
| Action | Folder |
|--------|--------|
| Write error reports | `INSPECTIONS/errors/` |
| Write todo items | `INSPECTIONS/todo/` |
| Read codebase (outside audit) | — |

### engineer
| Action | Folder |
|--------|--------|
| Write requirements | `REQUIREMENTS/` |
| Write engineering notes | `ENGINEERING/` |
| Write responses | `RESPONSES/` |
| Read plans and specs | `IMPLEMENTATION_PLANS/`, `SPECS/` |

### nexus-validator (subagent)
| Action | Folder |
|--------|--------|
| Read everything | read-only across audit |
| Write validation findings | `ANALYSIS/` |

### archivist (subagent)
| Action | Folder |
|--------|--------|
| Write historical records | `HISTORY/` |
| Update cross-references | `CROSS_REFERENCES.md` |
| Read everything | read-only across audit |

## Harness Compatibility

Each harness type connects to a role via the conduit-mcp AI config:

| Harness | Execution Mode | Roles It Can Serve |
|---------|---------------|-------------------|
| `harn-opencode` | interactive (`opencode run`) | planner, builder, reviewer, critic, analyst, architect |
| `harn-ollama-sdk` | daemon (`ollama run`) | builder, engineer |
| `harn-codex-cli` | oneshot (`codex exec`) | builder, reviewer, inspector |

## Filename Conventions

- `PROMPTS/` files: `{NNNN}-{kebab-case-title}.md` (e.g., `0089-finish-diagnosing-conduit.md`)
- `RESPONSES/` files: `{NNNN}-{kebab-case-title}.md` (e.g., `0001-conduit-diagnosis.md`)
- `IMPLEMENTATION_PLANS/` files: `{kebab-case-title}-v{NNNN}.md` (e.g., `diagnose-and-fix-conduit.md`)
- All other folders: `{kebab-case-title}.md`

## Agent Configuration

Agent role definitions live in `.opencode/agents/{role}.md`. Each carries
an `assumes_role` frontmatter key matching the folder map above. The
conduit-mcp server at `:3100` is the runtime authority for plan lifecycle,
but `nexus/audit/` is the durable filesystem audit trail.
