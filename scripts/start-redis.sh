#!/bin/bash
# Development script to start Redis for the Atomic platform

set -e

echo "Starting Redis for Atomic platform development..."

# Check if Redis is already running
if pgrep -f "redis-server" > /dev/null; then
    echo "Redis is already running. Stopping it first..."
    pkill -f "redis-server"
    sleep 2
fi

# Check if docker is available
if command -v docker &> /dev/null; then
    echo "Using Docker to start Redis..."
    docker run --name atomic-redis-dev -p 6379:6379 -d redis:latest
    
    # Wait for Redis to be ready
    sleep 3
    
    # Check if container is running
    if docker ps | grep -q atomic-redis-dev; then
        echo "Redis started successfully via Docker."
        echo "Redis is available at localhost:6379"
    else
        echo "Failed to start Redis via Docker."
        exit 1
    fi
elif command -v redis-server &> /dev/null; then
    echo "Starting Redis server directly..."
    redis-server --port 6379 &
    REDIS_PID=$!
    disown $REDIS_PID
    
    # Wait for Redis to start
    sleep 2
    
    # Test the connection
    if redis-cli -p 6379 ping &>/dev/null; then
        echo "Redis started successfully on PID $REDIS_PID."
        echo "Redis is available at localhost:6379"
    else
        echo "Redis failed to start properly."
        exit 1
    fi
else
    echo "Neither Docker nor direct redis-server installation found."
    echo "Please install either Redis server or Docker to run Redis."
    exit 1
fi

echo "Redis startup completed!"