#!/bin/bash

# Stop and remove existing container if it exists
if [ "$(docker ps -q -f name=atomic-mongodb)" ]; then
    echo "Stopping existing MongoDB container..."
    docker stop atomic-mongodb
fi

if [ "$(docker ps -a -q -f name=atomic-mongodb)" ]; then
    echo "Removing existing MongoDB container..."
    docker rm atomic-mongodb
fi

# For ARM64 systems, we might need to handle the architecture issue
echo "Starting MongoDB container..."

# Try older versions that don't have the ARM architecture restriction
if docker run -d --name atomic-mongodb -p 27017:27017 -e MONGO_INITDB_ROOT_USERNAME=mongoUser -e MONGO_INITDB_ROOT_PASSWORD=somePassword -v mongodb_data:/data/db mongo:4.4.18 || \
   docker run -d --name atomic-mongodb -p 27017:27017 -e MONGO_INITDB_ROOT_USERNAME=mongoUser -e MONGO_INITDB_ROOT_PASSWORD=somePassword -v mongodb_data:/data/db mongo:4.2.18 || \
   docker run -d --name atomic-mongodb -p 27017:27017 -e MONGO_INITDB_ROOT_USERNAME=mongoUser -e MONGO_INITDB_ROOT_PASSWORD=somePassword -v mongodb_data:/data/db mongo:4.0.28; then
    echo "MongoDB container started successfully!"
    echo "Container ID: $(docker ps -q -f name=atomic-mongodb)"
else
    echo "Error: Failed to start MongoDB container with multiple version attempts"
    echo "Note: On ARM64 systems with older processors, MongoDB may not work due to architecture requirements."
    echo "Consider using MongoDB Compass, or installing MongoDB locally instead of in Docker."
    exit 1
fi

# Check if the container is running properly
sleep 5
if [ "$(docker inspect -f '{{.State.Running}}' atomic-mongodb 2>/dev/null)" == "true" ]; then
    echo "MongoDB is running and ready on port 27017"
else
    echo "Error: MongoDB container failed to start properly"
    echo "Check logs with: docker logs atomic-mongodb"
    docker logs atomic-mongodb
    exit 1
fi
