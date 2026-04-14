# Media Metadata Service - Standalone Setup

This guide explains how to run the Media Metadata Service without Docker.

## Prerequisites

Before running the standalone script, ensure you have:

- Python 3.8+
- pip
- Node.js (with npm)
- MongoDB running on localhost:27017
- Redis running on localhost:6379
- MySQL running on localhost:3306

## Quick Start

Run the standalone startup script:

```bash
./start-standalone.sh
```

This will:
1. Create and activate a Python virtual environment
2. Install Python dependencies
3. Start the backend API server on port 8004
4. Install Node.js dependencies for the UI
5. Start the frontend UI on port 3000

## Configuration

The application uses environment variables for configuration. You can create a `.env` file in the project root to override defaults:

```bash
# Database URLs
REDIS_URL=redis://localhost:6379
MONGODB_URL=mongodb://localhost:27017/media_metadata
MYSQL_URL=mysql://username:password@localhost:3306/media
```

Check `app/config.py` for all configurable options.

## Access Points

Once started, you can access:

- Web UI: http://localhost:3000
- API: http://localhost:8004
- API Documentation: http://localhost:8004/docs
- System Status: http://localhost:8004/system/status

## Logs

- API logs: `logs/api.log`
- UI logs: `logs/ui.log`

## Stopping the Services

To stop the services, use the PIDs displayed when starting:

```bash
kill <API_PID> <UI_PID>
```

Or find the processes and kill them:

```bash
pkill -f "uvicorn"  # Stops the API
pkill -f "vite"     # Stops the UI
```