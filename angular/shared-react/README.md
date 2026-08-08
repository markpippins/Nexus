# @nexus/shared-react

Shared React components and utilities for nexus UIs.

## Usage

Each consuming UI declares it as a local dependency — npm creates a symlink in
`node_modules`, so source edits are picked up immediately with no rebuild:

```json
"dependencies": {
  "@nexus/shared-react": "file:../shared-react"
}
```

The `exports` map points at the raw `.ts`/`.tsx` source (no build step) — Vite
treats the linked package as source and transforms it with esbuild; `tsc` with
`moduleResolution: "bundler"` resolves and typechecks it directly.

> The `network-errors` and `response` utils are also **inlined** into
> tackle-ui, conduit-ui, and wind-ui (`src/utils/`) so those apps compile
> standalone after a Google AI Studio pull. This package is the reference
> implementation — keep the inlined copies in sync, and streamline back to
> `@nexus/shared-react` imports once GAIS contributions settle.

## Keeping the inlined copies in sync

`npm run check:inline` does two things in one run: (1) diffs the three apps'
`src/utils/` copies against this package's reference source (ignoring the
inlined header comments), and (2) runs `tsc --noEmit` in each app so the
inlined copies are proven to still typecheck. It exits non-zero on any drift
or typecheck failure. To sync a drifted copy, copy the reference file over it
(`cp utils/<file>.ts <app>/src/utils/`) and re-run.

For CI (or anywhere a pushed commit range is known), the check accepts an
optional **range gate** that skips the slow full check when the range touches
none of the shared-utils paths:

```bash
npm run check:inline -- --range HEAD~1..HEAD
```

The `--range BASE..LOCAL` gate mirrors the pre-push hook's logic: it runs the
full check only when the range touches the reference utils, an inlined copy,
the check script, or the hook itself, and exits 0 fast otherwise. An
unresolvable range (bad SHA / no git repo) runs the full check conservatively.

It is wired as a **pre-push git hook** (committed at `nexus/.githooks/pre-push`).
The hook is **range-aware**: it reads the refs being pushed and only runs the
full check when the pushed commits touch the reference utils, an inlined copy,
the check script, or the hook itself — otherwise it skips in milliseconds.
Run `npm run check:inline` manually anytime for a full worktree verification
regardless of what's being pushed. Enable the hook once per clone:

```bash
git config core.hooksPath .githooks
```

## Exports

- `@nexus/shared-react/utils/network-errors` — `NETWORK_FAILURE_MESSAGES`,
  `isNetworkFailure`, `friendlyFetchError`, `friendlyFetchMessage`
- `@nexus/shared-react/components/ThemeToggle` — theme-cycling button component

> `"sideEffects": false` is only safe because no module imports CSS. If a future
> module adds `import './x.css'`, move the CSS file to a `sideEffects`
> allowlist (or drop the flag) or the styles will be tree-shaken away.
