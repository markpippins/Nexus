# tackle-cli

Operator CLI for the tackle prompt/task registry. Inspects, diffs, and renders
prompts and tasks directly from PostgreSQL — no agent session required.

## Install

```bash
cd nexus/typescript/tackle-cli
npm install
npm run build
npm link        # makes `tackle` available on PATH
```

Or, without npm link:

```bash
node dist/index.js <args>
```

## Data source

PostgreSQL directly. The CLI uses the same DSN resolution as other tackle
services:

```
TACKLE_PG_DSN || CONDUIT_PG_DSN || postgresql://pguser:pgpass@localhost:5432/nexus
```

Redis and the prompt-sync-srv (:3501) are NOT used — PG is the canonical
source of truth with full version history, which is required for the diff
subcommand (Redis only caches the latest version per (role,slug)).

## Commands

### `tackle prompts list [--role <role>]`

Tabular list of the latest version of each prompt, one row per (role,slug).

```
ROLE              SLUG                       VER  TAGS                          UPDATED
operator          system-prompt-base         1    [operator, system]            2026-07-25 14:27
operator          system-prompt-tail         1    [operator, system]            2026-07-25 14:27
engineer          opencode-persona           2    [persona, opencode]          2026-07-25 14:30
...
```

Filter by role with `--role`. Without `--role`, all prompts across all roles
are listed.

### `tackle prompts show <role>/<slug> [--version <n>]`

Print the full `body_md` of a prompt, followed by a `_tackle` metadata block
(id, version, tags, created/updated timestamps, parameter schema).

Default version: latest. Specify `--version 1` for an earlier revision.

### `tackle prompts diff <role>/<slug> --from <v1> --to <v2>`

Unified diff between `body_md` of two versions. Useful for auditing persona
revisions.

### `tackle prompts render <role>/<slug> --params key=val [--version <n>]`

Substitute `${key}` markers in `body_md` with provided values. Multiple
`--params key=val` flags are allowed.

```
tackle prompts render operator/system-prompt-base \
  --params tool_catalog=foo --params procedure_cards=bar
```

Unsubstituted `${...}` markers are left intact (so operators can see what's
still missing).

### `tackle tasks list [--role <role>] [--all]`

Tabular list of tasks. Default: active only. `--all` includes retired/superseded.
`--role <role>` filters by role.

### `tackle tasks show <task-slug>`

Print a task's full definition: scope, acceptance criteria (bulleted), prompt
reference (role/slug/version), active status, timestamps.

## Verification

```bash
npm run lint    # tsc --noEmit
npm run build   # tsc
tackle prompts list
tackle prompts show engineer/opencode-persona
tackle prompts diff engineer/opencode-persona --from 1 --to 2
tackle prompts render operator/system-prompt-base --params tool_catalog=foo
tackle tasks list
tackle tasks show inspect-projects
```
