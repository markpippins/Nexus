# Plan 0075: Reduce default message box dimensions by 1/4

**Prompt:** — user request during session

## Goal

Reduce the default width and height of the message box (chat box) by 25% to give it a more compact initial appearance. Users can still resize manually via the drag handles — this only changes the **default** dimensions when a new message box is opened.

## Files Affected

1. `angular/conduit-ui/src/app/services/message-box.service.ts` — Change `DEFAULT_WIDTH` and `DEFAULT_HEIGHT` constants

## Acceptance Criteria

1. `DEFAULT_WIDTH` is reduced from 350 to **263** (rounded from 350 × 0.75 = 262.5)
2. `DEFAULT_HEIGHT` is reduced from 300 to **225** (300 × 0.75)
3. `MIN_WIDTH` (280) and `MIN_HEIGHT` (160) remain unchanged — user can still resize freely within the existing bounds
4. TypeScript compilation passes (`npx tsc --noEmit` in the project root)
5. New message boxes open at the smaller default size
6. Existing message boxes (in progress or minimized) retain their current dimensions — only new instances are affected

## Dependencies

None.

## Implementation

In `angular/conduit-ui/src/app/services/message-box.service.ts`:

```typescript
const DEFAULT_WIDTH = 263;  // 350 × 0.75 = 262.5, rounded to 263
const DEFAULT_HEIGHT = 225; // 300 × 0.75
```

No other changes needed — these constants are only used at box creation time (`open()` method, line 73). Existing boxes are unaffected since their dimensions are stored in the `MessageBoxInstance` object created at open time.
