#!/bin/bash
set -e

# ==============================================================================
# AUDITOR SUITE CONFIGURATION
# ==============================================================================
APP_NAME="Nebula"
SCHEMA_FILE="src/types/nebula.ts"
FRONTEND_DIR="src/components"
PORT_FILE="server.ts"
TARGET_PORT="5000"

# Where your custom protocol or OpenCode expects the payload
AUDITOR_PAYLOAD="gais_auditor_payload.md" 
# ==============================================================================

echo "Checking Google AI Studio for updates ($APP_NAME)..."
git fetch origin main

# Monitor the core API surface area
IF_CHANGES=$(git diff HEAD origin/main --name-only -- "$PORT_FILE" "$SCHEMA_FILE" "src/services/apiClient.ts" "$FRONTEND_DIR")

if [ -n "$IF_CHANGES" ]; then
    echo "⚠️ GAIS UI updates detected! Compiling auditor payload..."
    
    # 1. Inject the System Context Directive for your Auditor Prompt
    cat << EOF > "$AUDITOR_PAYLOAD"
# AUDITOR PROMPT CONTEXT: APPLICATION DRIFT DETECTED IN [$APP_NAME]
System Directive: You are the designated API Auditor for the $APP_NAME system suite. 
Analyze the raw structural git diffs attached below between our local engine baseline and the new layout engine pushes from GAIS.

## TARGET OBJECTIVES:
1. CONTRACT DRIFT: Identify newly declared or altered TypeScript interfaces in $SCHEMA_FILE.
2. ENVELOPE MISMATCHES: Audit payload keys vs actual routing parameters.
3. UNIMPLEMENTED ROUTING: Explicitly call out components making apiRequests to paths that do not exist or differ from definitions in $PORT_FILE.
4. SPECIFICATION OUTPUT: Draft the structured critique payload required by GAIS to bring the frontend and backend back into lockstep synchronization.

---

EOF

    # 2. Append Backend Endpoint Diffs
    echo -e "### 1. BACKEND ROUTE SURFACE CHANGES ($PORT_FILE)\n\`\`\`diff" >> "$AUDITOR_PAYLOAD"
    git diff HEAD origin/main -U5 -- "$PORT_FILE" >> "$AUDITOR_PAYLOAD"
    echo -e "\`\`\`\n" >> "$AUDITOR_PAYLOAD"

    # 3. Append Data Contract / Data Transfer Object (DTO) Diffs
    echo -e "### 2. CORE TYPE CONTRACT CHANGES ($SCHEMA_FILE)\n\`\`\`diff" >> "$AUDITOR_PAYLOAD"
    git diff HEAD origin/main -U5 -- "$SCHEMA_FILE" >> "$AUDITOR_PAYLOAD"
    echo -e "\`\`\`\n" >> "$AUDITOR_PAYLOAD"

    # 4. Append Frontend Component API Usage with Envelope Context
    echo -e "### 3. FRONTEND VIEW COMPONENT CALL ENVELOPES ($FRONTEND_DIR)\n\`\`\`diff" >> "$AUDITOR_PAYLOAD"
    # Captures context surrounding apiRequests to pass raw parameters straight to the auditor
    git diff HEAD origin/main -U3 -- "$FRONTEND_DIR/**/*.tsx" | grep -A 3 -B 3 "apiRequest" >> "$AUDITOR_PAYLOAD" || echo "No layout or client apiRequest alterations found." >> "$AUDITOR_PAYLOAD"
    echo -e "\`\`\`\n" >> "$AUDITOR_PAYLOAD"

    echo "✅ Auditor context payload compiled successfully at: $AUDITOR_PAYLOAD"
else
    echo "✅ No core system drift detected from GAIS for $APP_NAME."
fi

# 5. EXECUTE RAD STATE RESET
echo "Syncing local branches..."
git checkout main
git reset --hard HEAD~1
git pull origin main

NEW_DEV_BRANCH="dev-$(date +%Y%m%d%H%M%S)"
git checkout -b "$NEW_DEV_BRANCH"

# 6. HEADLESS LOCAL CONFIGURATION PREPARATION
if [ -f "$PORT_FILE" ]; then
    echo "Adapting local port configurations inside $PORT_FILE..."
    sed -i "s/PORT = 3000/PORT = $TARGET_PORT/g" "$PORT_FILE" 
fi

# 7. LAUNCH WORKSPACE
# Triggers your custom protocol hook or manual text validation
kate "$PORT_FILE"
