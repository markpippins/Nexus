# Plan 0077: Add slash commands to the chat message box

**Prompt:** 0081 (implement my ideas for adding slash commands to the chat UI)

## Goal

Add a slash command system to the chat message box so users can type `/command` to trigger actions like `/help`, `/clear`, `/summarize`, and `/feedback`. The input detects a leading `/` and presents an autocomplete dropdown of matching commands, then executes the selected command (some client-side, some sent to the agent chat server).

## Files Affected

1. **`nexus-ui/pipeline-viewer/src/app/services/message-box.service.ts`** — Add a slash command registry (command definitions with label, description, handler) and a `handleSlashCommand(text)` method
2. **`nexus-ui/pipeline-viewer/src/app/components/message-box/message-box.component.ts`** — Add slash detection in `onKeydown()`, a command list signal, filtered results computed property, template changes for the autocomplete dropdown, and key bindings for Tab/Enter selection
3. **`nexus-ui/pipeline-viewer/src/app/components/keyboard-help/keyboard-help.component.ts`** — Optionally register dynamic slash-command shortcuts in the help overlay if needed

## Acceptance Criteria

1. **Slash detection:** When the user types `/` as the first character of the input textarea, an autocomplete dropdown appears below the input
2. **Filtering:** As the user types more characters after `/` (e.g., `/he`), the dropdown filters to show only matching commands (case-insensitive prefix match)
3. **Available commands (initial set):**
   - `/help` — Show keyboard shortcuts (reuses existing help overlay via `KeyboardShortcutService.toggleHelp()`)
   - `/clear` — Clear all messages in the current conversation
   - `/summarize` — Send a summarization request (prepends a summarization instruction to the next LLM submission)
   - `/feedback` — Open a feedback prompt (placeholder for future server-side handling)
4. **Keyboard navigation:**
   - Pressing **Tab** or **Enter** on a highlighted/first command selects and executes it, replacing the input with the command result or executing the action
   - Pressing **Escape** dismisses the dropdown without executing
   - Arrow **Up/Down** moves the selection highlight in the dropdown (optional, initial implementation may auto-select the first match)
   - Typing more characters refilters the list in real-time
5. **Fallback behavior:** If `/` is typed but no command matches, the dropdown shows "No matching commands" and a regular Enter submits the text as-is
6. **Existing behavior preserved:**
   - Enter (without Shift, no dropdown active) still submits the message
   - Shift+Enter still inserts a newline
   - The textarea continues to work normally for non-command messages
7. **TypeScript compilation passes:** `ng build` (production build succeeds with no errors)
8. **Tests:** At minimum, the existing suite continues to pass (if any component tests exist)

## Dependencies

- None. The feature is additive and does not depend on pending plans 0070 or 0075.

## Implementation Notes

### Slash Command Registry (message-box.service.ts)

Add a `SlashCommand` interface and a static registry:

```typescript
export interface SlashCommand {
  id: string;           // e.g. 'help', 'clear'
  label: string;        // display label
  description: string;  // short help text
  execute: (service: MessageBoxService, boxId: string, args: string) => void;
}

export const BUILT_IN_COMMANDS: SlashCommand[] = [
  {
    id: 'help',
    label: '/help',
    description: 'Show keyboard shortcuts',
    execute: (svc, id, args) => { /* call KeyboardShortcutService.toggleHelp() */ },
  },
  {
    id: 'clear',
    label: '/clear',
    description: 'Clear conversation',
    execute: (svc, id, args) => { svc.patch(id, (b) => ({ ...b, messages: [] })); },
  },
  {
    id: 'summarize',
    label: '/summarize',
    description: 'Request conversation summary',
    execute: (svc, id, args) => { /* prepend summarization to next submit */ },
  },
  {
    id: 'feedback',
    label: '/feedback',
    description: 'Send feedback',
    execute: (svc, id, args) => { /* placeholder — future server endpoint */ },
  },
];
```

### Slash Detection in message-box.component.ts

In `onKeydown()`:
- If the draft starts with `/` and there's no space after it, we're in "slash mode"
- Filter `BUILT_IN_COMMANDS` by prefix match against the text after `/`
- Show the dropdown via a template `*ngIf` block below the textarea
- On Enter/Tab: execute the first (or selected) command
- On Escape: hide the dropdown, stay in the textarea

### Template addition

Add below the `.mbox-compose` textarea:
```html
<div class="slash-dropdown" *ngIf="slashActive()">
  <div class="slash-item" *ngFor="let cmd of filteredCmds(); let i = index"
    [class.selected]="i === selectedIdx()"
    (click)="executeSlash(cmd)">
    <span class="slash-label">{{ cmd.label }}</span>
    <span class="slash-desc">{{ cmd.description }}</span>
  </div>
  <div class="slash-empty" *ngIf="filteredCmds().length === 0">
    No matching commands
  </div>
</div>
```

### Styles (added to message-box.component.ts styles array)

```
.slash-dropdown{position:absolute;bottom:100%;left:12px;right:12px;background:var(--bg-primary);border:1px solid var(--border-default);border-radius:6px;box-shadow:0 -4px 16px var(--card-shadow);max-height:160px;overflow-y:auto;z-index:10}
.slash-item{display:flex;justify-content:space-between;padding:8px 12px;cursor:pointer;font-size:13px}
.slash-item:hover,.slash-item.selected{background:var(--bg-secondary)}
.slash-label{font-weight:600;color:var(--accent-blue-text)}
.slash-desc{color:var(--text-muted);font-size:12px}
.slash-empty{padding:12px;text-align:center;color:var(--text-muted);font-style:italic}
```
