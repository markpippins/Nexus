#!/bin/bash

# Atomic Project Environment Variable Setup Script
# This script loads environment variables from .env files and sets defaults for the project's microservices

set -e  # Exit immediately if a command exits with a non-zero status

# Default values for environment variables
DEFAULT_BROKER_GATEWAY_URL="http://localhost:8080"
DEFAULT_PORT=3333
DEFAULT_HOST="0.0.0.0"
DEFAULT_IMAGE_SERVER_PORT=8081
DEFAULT_SEARCH_SERVER_PORT=8082
DEFAULT_FS_SERVER_PORT=4040
DEFAULT_UNSPLASH_SERVER_PORT=8083

# Function to load .env files from a specific directory
load_env_file() {
    local env_file="$1"
    if [ -f "$env_file" ]; then
        echo "Loading environment variables from $env_file..."
        # shellcheck disable=SC1090
        source "$env_file"
        return 0
    else
        echo "Warning: $env_file does not exist, using defaults"
        return 1
    fi
}

# Function to set a default env value if not already set
set_default() {
    local var_name="$1"
    local default_value="$2"
    
    if [ -z "${!var_name:-}" ]; then
        export "$var_name=$default_value"
        echo "Set $var_name to default value: $default_value"
    else
        echo "Using existing value for $var_name: ${!var_name}"
    fi
}

echo "Setting up environment variables for Atomic project..."

# Load common environment file if it exists
load_env_file ".env"

# Load environment for broker-service-proxy
echo "Setting up broker-service-proxy environment..."
load_env_file "./node/broker-service-proxy/.env.local" || true
set_default "PORT" "$DEFAULT_PORT"
set_default "HOST" "$DEFAULT_HOST"
set_default "BROKER_GATEWAY_URL" "$DEFAULT_BROKER_GATEWAY_URL"

# Load environment for image server
echo "Setting up image server environment..."
load_env_file "./node/image-server/.env.local" || true
set_default "IMAGE_SERVER_PORT" "$DEFAULT_IMAGE_SERVER_PORT"
set_default "IMAGE_ROOT_DIR" "$(pwd)/images"

# Load environment for google search service
echo "Setting up google search service environment..."
set_default "SEARCH_SERVER_PORT" "$DEFAULT_SEARCH_SERVER_PORT"
# Note: GOOGLE_API_KEY and SEARCH_ENGINE_ID should be set in .env or environment

# Load environment for file system server
echo "Setting up file system server environment..."
load_env_file "./node/file-system-server/.env.local" || true
set_default "FS_SERVER_PORT" "$DEFAULT_FS_SERVER_PORT"
set_default "FS_ROOT_DIR" "$(pwd)/user-data"

# Load environment for unsplash service
echo "Setting up unsplash service environment..."
set_default "UNSPLASH_SERVER_PORT" "$DEFAULT_UNSPLASH_SERVER_PORT"
# Note: UNSPLASH_ACCESS_KEY should be set in .env or environment

# Load environment for Next.js applications
echo "Setting up Next.js applications environment..."
set_default "NEXT_PUBLIC_BROKER_GATEWAY_URL" "$DEFAULT_BROKER_GATEWAY_URL"
set_default "NEXT_PUBLIC_DEBUG_MODE" "false"
set_default "NEXT_PUBLIC_API_URL" "http://localhost:$DEFAULT_FS_SERVER_PORT/fs"
set_default "NEXT_PUBLIC_DEBUG_USER_ALIAS" "debug_user"
set_default "NEXT_PUBLIC_DEBUG_USER_EMAIL" "debug@example.com"
set_default "GEMINI_API_KEY" ""

# Database environment variables (typically for Docker)
echo "Setting up database environment variables..."
set_default "MYSQL_ROOT_PASSWORD" "rootpass"
set_default "MYSQL_DATABASE" "userdb"
set_default "SPRING_DATASOURCE_URL" "jdbc:mysql://localhost:3306/user_service?createDatabaseIfNotExist=true"
set_default "SPRING_DATASOURCE_USERNAME" "root"
set_default "SPRING_DATASOURCE_PASSWORD" "$MYSQL_ROOT_PASSWORD"
set_default "SPRING_DATA_MONGODB_URI" "mongodb://localhost:27017/broker-gateway"

echo "Environment variables setup completed!"

echo ""
echo "Current environment variable settings:"
echo "======================================="
echo "BROKER_PROXY_PORT: $PORT"
echo "HOST: $HOST"
echo "BROKER_GATEWAY_URL: $BROKER_GATEWAY_URL"
echo "IMAGE_SERVER_PORT: $IMAGE_SERVER_PORT"
echo "IMAGE_ROOT_DIR: $IMAGE_ROOT_DIR"
echo "SEARCH_SERVER_PORT: $SEARCH_SERVER_PORT"
echo "FS_SERVER_PORT: $FS_SERVER_PORT"
echo "FS_ROOT_DIR: $FS_ROOT_DIR"
echo "UNSPLASH_SERVER_PORT: $UNSPLASH_SERVER_PORT"
echo "NEXT_PUBLIC_BROKER_GATEWAY_URL: $NEXT_PUBLIC_BROKER_GATEWAY_URL"
echo "NEXT_PUBLIC_DEBUG_MODE: $NEXT_PUBLIC_DEBUG_MODE"
echo "NEXT_PUBLIC_API_URL: $NEXT_PUBLIC_API_URL"
echo "NEXT_PUBLIC_DEBUG_USER_ALIAS: $NEXT_PUBLIC_DEBUG_USER_ALIAS"
echo "NEXT_PUBLIC_DEBUG_USER_EMAIL: $NEXT_PUBLIC_DEBUG_USER_EMAIL"
echo "SPRING_DATASOURCE_URL: $SPRING_DATASOURCE_URL"
echo "SPRING_DATA_MONGODB_URI: $SPRING_DATA_MONGODB_URI"

echo ""
echo "To use these variables in your current shell, run: source $0"
echo "Or in a subshell: . $0"