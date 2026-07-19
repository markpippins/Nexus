# Assembly (Angular)

Modern, tight Angular reimplementation of the Assembly deliberation UI.

## Development

```bash
bun install
bun run dev
```

The dev server runs on **http://localhost:4204**.

## Backend

The UI expects `assembly-srv` to be running at `http://localhost:3107`.
The dev proxy is configured in `proxy.conf.json`.

## Features

- Tight Microsoft Office/Gmail-style layout with minimal margins
- Collapsible sidebar navigation with live entity counts
- List views for all top-level business objects
- "Raise Question" action on every top-level object that creates an Open Question linked back to the object
- No visible raw IDs (titles and descriptions only)
- Nebula color theme (primary purple, gray scale)
