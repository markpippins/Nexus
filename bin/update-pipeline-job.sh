#!/bin/bash
# update-pipeline-job.sh — push a Jenkinsfile into the nexus-pipeline job
# (runs ON vanadium; Jenkins runs in the vd-ci-jenkins container).
# Usage: update-pipeline-job.sh /tmp/nexus-Jenkinsfile
set -euo pipefail

JF="${1:?usage: update-pipeline-job.sh <jenkinsfile>}"
docker cp "$JF" vd-ci-jenkins:/tmp/nexus-Jenkinsfile

docker exec vd-ci-jenkins bash -s -- "$JF" <<'REMOTE'
set -euo pipefail
CRUMB=$(curl -s "http://localhost:8080/crumbIssuer/api/xml?xpath=concat(//crumbRequestField,%22:%22,//crumb)" -u "admin:$JENKINS_ADMIN_PASS")
curl -s -o /dev/null -w "config upload: HTTP %{http_code}\n" \
  -X POST "http://localhost:8080/job/nexus-pipeline/config.xml" \
  -H "$CRUMB" -H "Content-Type: application/xml" \
  -u "admin:$JENKINS_ADMIN_PASS" \
  --data-binary @/tmp/nexus-Jenkinsfile
REMOTE

echo "triggering build..."
docker exec vd-ci-jenkins bash -c '
  CRUMB=$(curl -s "http://localhost:8080/crumbIssuer/api/xml?xpath=concat(//crumbRequestField,%22:%22,//crumb)" -u "admin:$JENKINS_ADMIN_PASS")
  curl -s -o /dev/null -w "build trigger: HTTP %{http_code}\n" \
    -X POST "http://localhost:8080/job/nexus-pipeline/build" \
    -H "$CRUMB" -u "admin:$JENKINS_ADMIN_PASS"
'
