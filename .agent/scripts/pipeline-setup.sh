#!/bin/bash

# pipeline-setup.sh
# Creates the standard WorkRequest pipeline directory structure in the target folder.

if [ -z "$1" ]; then
  echo "Usage: $0 <target_directory>"
  exit 1
fi

TARGET_DIR="$1"

if [ ! -d "$TARGET_DIR" ]; then
  echo "Error: Target directory '$TARGET_DIR' does not exist."
  exit 1
fi

PIPELINE_DIR="$TARGET_DIR/.pipeline"

# Create the main directories
mkdir -p "$PIPELINE_DIR/IMPLEMENTATION_PLAN_RECORD"
mkdir -p "$PIPELINE_DIR/PROMPT_RECORDS"
mkdir -p "$PIPELINE_DIR/RESPONSE_RECORDS"
mkdir -p "$PIPELINE_DIR/WORK_REQUESTS"

# Create the Work Request subdirectories
mkdir -p "$PIPELINE_DIR/WORK_REQUESTS/active"
mkdir -p "$PIPELINE_DIR/WORK_REQUESTS/artifacts"
mkdir -p "$PIPELINE_DIR/WORK_REQUESTS/complete"
mkdir -p "$PIPELINE_DIR/WORK_REQUESTS/failed"
mkdir -p "$PIPELINE_DIR/WORK_REQUESTS/log"
mkdir -p "$PIPELINE_DIR/WORK_REQUESTS/queued"

echo "Successfully created pipeline structure in $TARGET_DIR"
