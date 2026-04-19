#!/bin/bash
# Start broker-gateway with Dev profile
# This configuration is for local development with debug logging

echo "Starting Broker Gateway with Dev profile..."
echo "File System Server: http://localhost:4040/fs"
echo "MongoDB: localhost:27017"
echo "Logging: DEBUG level enabled"
echo ""

java -jar target/broker-gateway-1.0.0-SNAPSHOT.jar --spring.profiles.active=dev
