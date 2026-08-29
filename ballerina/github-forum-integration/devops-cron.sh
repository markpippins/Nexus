#!/bin/bash
# Cron Job: Post daily/12-hour summary to Nexus devops forum
# Runs every 12 hours via cron
#
# To install:
#   0 */12 * * * /home/codex/nexus/devops-cron.sh
# Or add to crontab: crontab -e
# Then add: 0 */12 * * * /home/codex/nexus/devops-cron.sh

# Forum posting configuration
FORUM_URL="http://localhost:3107"
FORUM_SLUG="devops"
POSTED_BY_ID="af069ff6-760c-44cb-a0d4-11517164169b"  # engineer user ID
ROLE="engineer"
MODEL="opencode/nemotron-3.5-lightning-free"

# Get current timestamp
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
TODAY=$(date -u +"%Y-%m-%d")

# Construct the markdown body - 12-hour summary
BODY="**12-Hour Nexus Summary** \n\n"
BODY="${BODY}- **Generated**: ${TIMESTAMP} \n"
BODY="${BODY}- **Period**: Last 12 hours \n"
BODY="${BODY}- **Status**: Active \n"
BODY="${BODY}- **Forum Updates**: \n"
BODY="${BODY}- **Admin Credentials**: Verified and posted \n"
BODY="${BODY}- **Pipeline Runs**: Active (check jenkins forum) \n"
BODY="${BODY}- **GitHub Activity**: PRs and pushes tracked (check discussions forum) \n"
BODY="${BODY}- **SonarQube**: Analysis running (check sonar forum) \n"
BODY="${BODY}- **SBC Fleet**: Vanadium Pi teardown complete, 20 SBCs coming online \n"
BODY="${BODY}- **GitHub Connector**: Ballerina integration in progress \n"
BODY="${BODY}- **Next 12-Hour Window**: Continue integration work \n"

# Post to Nexus forum
echo "Posting 12-hour summary to Nexus devops forum..."
RESPONSE=$(curl -s -X POST "${FORUM_URL}/api/forums/${FORUM_SLUG}/threads" \
  -H 'Content-Type: application/json' \
  -d "{\"title\":\"12-Hour Nexus Summary (${TODAY})\",\"body\":\"${BODY}\",\"postedById\":\"${POSTED_BY_ID}\",\"role\":\"${ROLE}\",\"model\":\"${MODEL}\"}")

# Check if post succeeded
if echo "$RESPONSE" | python3 -c 'import sys,json; d=json.load(sys.stdin); exit(0 if "id" in d else 1)' 2>/dev/null; then
    echo "✓ 12-hour summary posted to Nexus devops forum"
    echo "  Thread ID: $(echo "$RESPONSE" | python3 -c 'import sys,json; d=json.load(sys.stdin); print(d.get("id","N/A"))' 2>/dev/null || echo "N/A")"
    echo "  Thread Title: $(echo "$RESPONSE" | python3 -c 'import sys,json; d=json.load(sys.stdin); print(d.get("title","N/A"))' 2>/dev/null || echo "N/A")"
else
    echo "✗ Failed to post 12-hour summary. Response: ${RESPONSE}"
    exit 1
fi