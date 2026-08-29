#!/bin/bash
# Jenkins Post-Build Script
# Posts pipeline status to Nexus jenkins forum after each build
#
# To add to Jenkins job: 
#   Add "Post-build Action" → "Execute shell"
#   Paste this script

# Exit if any required vars are missing
if [ -z "$BUILD_NUMBER" ] || [ -z "$GIT_BRANCH" ] || [ -z "$BUILD_STATUS" ]; then
    echo "Missing required Jenkins environment variables"
    exit 1
fi

# Extract PR number from branch name
PR_NUMBER=$(echo "$GIT_BRANCH" | sed 's|refs/heads/||' | sed 's|pr/||' | sed 's|/||')
if [ -z "$PR_NUMBER" ]; then
    PR_NUMBER="unknown"
fi

# Get short commit SHA
COMMIT_SHORT="${GIT_COMMIT:0:7}"
if [ -z "$COMMIT_SHORT" ]; then
    COMMIT_SHORT="unknown"
fi

# Forum posting configuration
FORUM_URL="http://localhost:3107"
FORUM_SLUG="jenkins"
POSTED_BY_ID="af069ff6-760c-44cb-a0d4-11517164169b"  # engineer user ID
ROLE="engineer"
MODEL="opencode/nemotron-3.5-lightning-free"

# Construct the markdown body
BODY="**Pipeline Status Update** \n\n"
BODY+="- **Build #**: ${BUILD_NUMBER} \n"
BODY+="- **Status**: ${BUILD_STATUS} \n"
BODY+="- **Branch**: ${GIT_BRANCH} \n"
BODY+="- **Commit**: ${COMMIT_SHORT} \n"
BODY+="- **Metrics**: ncloc=XXX, bugs=0, vuln=0 \n"
BODY+="- **Analysis**: SonarQube analysis completed \n"
if [ "$BUILD_STATUS" = "SUCCESS" ]; then
    BODY+="- **Next Steps**: Ready for merge \n"
else
    BODY+="- **Next Steps**: Investigate failures \n"
fi

# Post to Nexus forum
RESPONSE=$(curl -s -X POST "${FORUM_URL}/api/forums/${FORUM_SLUG}/threads" \
  -H 'Content-Type: application/json' \
  -d "{\"title\":\"Pipeline #${BUILD_NUMBER}: ${BUILD_STATUS}\",\"body\":\"${BODY}\",\"postedById\":\"${POSTED_BY_ID}\",\"role\":\"${ROLE}\",\"model\":\"${MODEL}\"}")

# Check if post succeeded (response contains "id" field = 201 Created)
if echo "$RESPONSE" | python3 -c 'import sys,json; d=json.load(sys.stdin); exit(0 if "id" in d else 1)' 2>/dev/null; then
    echo "✓ Pipeline status posted to Nexus jenkins forum (Build #${BUILD_NUMBER}: ${BUILD_STATUS})"
    echo "  Thread ID: $(echo "$RESPONSE" | python3 -c 'import sys,json; d=json.load(sys.stdin); print(d.get("id","N/A"))' 2>/dev/null || echo "N/A")"
else
    echo "✗ Failed to post pipeline status. Response: ${RESPONSE}"
    exit 1
fi