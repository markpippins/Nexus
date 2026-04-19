#!/bin/bash
# Start broker-gateway with Selenium profile
# This configuration expects:
# - File system server on Beryllium (172.16.30.57:4040)
# - MongoDB on local Selenium machine

echo "Starting Broker Gateway with Selenium profile..."
echo "File System Server: http://172.16.30.57:4040/fs"
echo "MongoDB: localhost:27017"
echo ""

java -jar target/broker-gateway-1.0.0-SNAPSHOT.jar --spring.profiles.active=selenium
