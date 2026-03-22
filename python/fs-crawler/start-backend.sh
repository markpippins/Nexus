#!/bin/bash

# Script to start just the backend of the fs-crawler service
# This script starts the FastAPI server without the UI

set -e  # Exit on any error

echo "Starting fs-crawler backend service..."

# Get the directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Change to the project directory
cd "$SCRIPT_DIR"

echo "Working directory: $(pwd)"

# Check if virtual environment exists, if not create it
if [ ! -d "venv" ]; then
    echo "Creating virtual environment..."
    python3 -m venv venv
fi

# Activate virtual environment
source venv/bin/activate

# Install dependencies if requirements.txt is newer than the installation marker
if [ ! -f ".deps_installed" ] || [ requirements.txt -nt .deps_installed ]; then
    echo "Installing dependencies..."
    pip install --upgrade pip
    pip install -r requirements.txt
    touch .deps_installed
fi

# Create logs directory if it doesn't exist
mkdir -p logs

# Start the backend server
echo "Starting backend server on port 8004..."
echo "Access the API at: http://localhost:8004"
echo "API Documentation: http://localhost:8004/docs"
echo "Press Ctrl+C to stop the server"

# Run the server with enhanced logging
python run_server.py 2>&1 | tee -a logs/backend.log &

# Store the PID of the background process
SERVER_PID=$!

# Function to handle script termination
cleanup() {
    echo
    echo "Stopping backend server (PID: $SERVER_PID)..."
    kill $SERVER_PID 2>/dev/null || true
    
    # Wait a bit for graceful shutdown
    sleep 2
    
    # Force kill if still running
    if kill -0 $SERVER_PID 2>/dev/null; then
        echo "Force stopping backend server..."
        kill -9 $SERVER_PID 2>/dev/null || true
    fi
    
    echo "Backend server stopped."
    exit 0
}

# Set up signal traps for graceful shutdown
trap cleanup SIGTERM SIGINT EXIT

# Wait for the server process
wait $SERVER_PID