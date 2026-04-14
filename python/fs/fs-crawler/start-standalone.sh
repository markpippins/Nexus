#!/bin/bash

# Standalone startup script for Media Metadata Service (without Docker)
# Assumes backend services (MongoDB, Redis, MySQL) are already running

set -e  # Exit on any error

echo "🚀 Starting Media Metadata Service (Standalone Mode)"
echo ""

# Function to check if a command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Check prerequisites
MISSING_DEPS=()

if ! command_exists python3; then
    MISSING_DEPS+=("python3")
fi

if ! command_exists pip; then
    MISSING_DEPS+=("pip")
fi

if ! command_exists npm; then
    MISSING_DEPS+=("npm")
fi

if [ ${#MISSING_DEPS[@]} -ne 0 ]; then
    echo "❌ Missing required dependencies: ${MISSING_DEPS[*]}"
    echo "Please install them before proceeding."
    exit 1
fi

echo "✅ Dependencies check passed"

# Check if virtual environment exists, create if not
if [ ! -d "venv" ]; then
    echo "📦 Creating virtual environment..."
    python3 -m venv venv
fi

# Activate virtual environment
source venv/bin/activate

# Install Python dependencies
echo "📦 Installing Python dependencies..."
pip install -r requirements.txt

# Create logs directory if it doesn't exist
mkdir -p logs

# Start the backend API in the background
echo "🔌 Starting API server (port 8004)..."
cd app
PYTHONPATH=.. nohup python3 -m uvicorn main:app --host 0.0.0.0 --port 8004 --reload > ../logs/api.log 2>&1 &
API_PID=$!
cd ..

# Wait a moment for the API to start
sleep 3

# Check if API is running
if kill -0 $API_PID 2>/dev/null; then
    echo "✅ API server started successfully (PID: $API_PID)"
    echo "   • API:              http://localhost:8004"
    echo "   • API Docs:         http://localhost:8004/docs"
    echo "   • System Status:    http://localhost:8004/system/status"
else
    echo "❌ Failed to start API server"
    exit 1
fi

# Install and start the frontend UI
echo "🌐 Setting up and starting UI (port 3000)..."
cd ui

# Install Node.js dependencies if node_modules doesn't exist
if [ ! -d "node_modules" ]; then
    echo "📦 Installing Node.js dependencies..."
    npm install
fi

# Start the UI in the background
# Use a different approach for the UI since npm run dev might not work well with nohup
npm run dev > ../logs/ui.log 2>&1 &
UI_PID=$!
cd ..

# Wait a moment for the UI to start
sleep 5

# Check if UI is running
if kill -0 $UI_PID 2>/dev/null; then
    echo "✅ UI server started successfully (PID: $UI_PID)"
    echo "   • Web UI:           http://localhost:3000"
else
    echo "⚠️  UI server may still be starting up"
    echo "   • Web UI:           http://localhost:3000"
fi

echo ""
echo "🎉 Services started successfully!"
echo ""
echo "📊 Access points:"
echo "   • Web UI:           http://localhost:3000"
echo "   • API:              http://localhost:8004"
echo "   • API Docs:         http://localhost:8004/docs"
echo "   • System Status:    http://localhost:8004/system/status"
echo ""
echo "📋 Process IDs:"
echo "   • API PID:          $API_PID"
echo "   • UI PID:           $UI_PID"
echo ""
echo "📝 Useful commands:"
echo "   • View API logs:    tail -f logs/api.log"
echo "   • View UI logs:     tail -f logs/ui.log"
echo "   • Stop services:    kill $API_PID $UI_PID"
echo ""
echo "💡 Note: Make sure MongoDB (port 27017), Redis (port 6379), and MySQL (port 3306) are running"
echo "   before starting this service. Check app/config.py for connection details."
echo ""

# Keep the script running
wait $API_PID $UI_PID