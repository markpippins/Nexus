#!/bin/bash
# Start broker-gateway with Beryllium profile
# This configuration expects:
# - File system server on local Beryllium machine (localhost:4040)
# - MongoDB on local Beryllium machine

echo "Starting Broker Gateway with Beryllium profile..."
echo "File System Server: http://localhost:4040/fs"
echo "MongoDB: localhost:27017"
echo ""

java -jar target/broker-gateway-1.0.0-SNAPSHOT.jar --spring.profiles.active=beryllium
