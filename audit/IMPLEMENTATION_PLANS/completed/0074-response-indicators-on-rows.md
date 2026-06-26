# Plan 0074: Add response indicators to prompt catalog rows

**Prompt:** 0073 (end to end test — auto-save audit trail)

## Goal

Add a visual indicator to each row in the Prompts tab so users can see at a glance which prompts have received a response and which are still awaiting one, without having to click into each entry.

## Files Affected

1. `pipeline-viewer/src/app/components/prompt-catalog/prompt-catalog.component.ts` — Add indicator span and CSS styles

## Acceptance Criteria

1. Each row in the Prompts list shows ✅ when the prompt has a non-empty `response` field
2. Each row shows ⏳ when the prompt has no response yet
3. Awaiting indicators are visually subdued (lower opacity) to distinguish from responded ones
4. The indicator has a tooltip ("Has response" / "Awaiting response")
5. Angular production build passes (`ng build --configuration production`)

## Dependencies

None. The `response` field was already added to `PromptEntry` in the previous audit trail work.

## Implementation

### 1. Template change

Insert a `<span>` between the prompt number and title in the row template:

```html
<span class="resp-indicator"
  [class.responded]="p.response"
  [title]="p.response ? 'Has response' : 'Awaiting response'">
  {{p.response ? '✅' : '⏳'}}
</span>
```

### 2. CSS

```css
.resp-indicator {
  font-size: 11px;
  width: 18px;
  text-align: center;
  opacity: 0.5;
}
.resp-indicator.responded {
  opacity: 1;
}
```

(The implementation was already applied in the previous session but the plan was not written first.)
