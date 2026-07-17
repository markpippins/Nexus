#!/bin/bash
# start-mongodb-docker.sh — start MongoDB via Docker with cleanup
# Called by systemd unit: mongodb.service

set -e

CONTAINER_NAME="atomic-mongodb"
MONGO_PORT="27017"

echo "[mongodb] Pruning old Docker artifacts..."
docker system prune -f 2>/dev/null || true

# Stop and remove existing container if it exists
if [ "$(docker ps -q -f name=${CONTAINER_NAME})" ]; then
    echo "[mongodb] Stopping existing container..."
    docker stop ${CONTAINER_NAME} 2>/dev/null || true
fi

if [ "$(docker ps -a -q -f name=${CONTAINER_NAME})" ]; then
    echo "[mongodb] Removing existing container..."
    docker rm ${CONTAINER_NAME} 2>/dev/null || true
fi

echo "[mongodb] Starting MongoDB container..."
# Try multiple versions for ARM64 compatibility
# Clean up container after each failed attempt to avoid name collision
MONGO_VERSIONS=("mongo:4.4.18" "mongo:4.2.18" "mongo:4.0.28")
STARTED=false
for ver in "${MONGO_VERSIONS[@]}"; do
    echo "[mongodb] Trying $ver ..."
    if docker run -d --name ${CONTAINER_NAME} -p ${MONGO_PORT}:27017 \
        -e MONGO_INITDB_ROOT_USERNAME=mongoUser \
        -e MONGO_INITDB_ROOT_PASSWORD=somePassword \
        -v mongodb_data:/data/db "$ver"; then
        echo "[mongodb] Container started with $ver"
        STARTED=true
        break
    else
        echo "[mongodb] $ver failed, cleaning up..."
        docker rm -f ${CONTAINER_NAME} 2>/dev/null || true
    fi
done

if [ "$STARTED" != "true" ]; then
    echo "[mongodb] ERROR: Failed to start MongoDB container with all version attempts." >&2
    exit 1
fi

# Check if the container is running
sleep 5
if [ "$(docker inspect -f '{{.State.Running}}' ${CONTAINER_NAME} 2>/dev/null)" == "true" ]; then
    echo "[mongodb] Ready on port ${MONGO_PORT}"
else
    echo "[mongodb] ERROR: Container failed to start properly. Logs:" >&2
    docker logs ${CONTAINER_NAME} 2>&1
    exit 1
fi
