#!/bin/bash

# Script to check and validate environment variables for the Atomic project

echo "Checking environment variables for Atomic project..."

# Function to check if an environment variable is set and not empty
check_env_var() {
    local var_name="$1"
    local is_sensitive="$2"  # Pass "sensitive" as second parameter to hide the value
    
    if [ -z "${!var_name:-}" ]; then
        echo "❌ $var_name: NOT SET"
        return 1
    else
        if [ "$is_sensitive" = "sensitive" ]; then
            echo "✅ $var_name: SET (value hidden)"
        else
            echo "✅ $var_name: ${!var_name}"
        fi
        return 0
    fi
}

# Check required environment variables
echo ""
echo "Core Service Configuration:"
echo "============================"
check_env_var "BROKER_PROXY_PORT"
check_env_var "HOST"
check_env_var "BROKER_GATEWAY_URL"

echo ""
echo "Service Ports:"
echo "=============="
check_env_var "IMAGE_SERVER_PORT"
check_env_var "SEARCH_SERVER_PORT"
check_env_var "FS_SERVER_PORT"
check_env_var "UNSPLASH_SERVER_PORT"

echo ""
echo "Service Directories:"
echo "===================="
check_env_var "IMAGE_ROOT_DIR"
check_env_var "FS_ROOT_DIR"

echo ""
echo "API Keys (sensitive):"
echo "====================="
check_env_var "GOOGLE_API_KEY" "sensitive"
check_env_var "UNSPLASH_ACCESS_KEY" "sensitive"
check_env_var "GEMINI_API_KEY" "sensitive"

echo ""
echo "Database Configuration:"
echo "======================="
check_env_var "MYSQL_ROOT_PASSWORD" "sensitive"
check_env_var "MYSQL_DATABASE"
check_env_var "SPRING_DATASOURCE_URL"
check_env_var "SPRING_DATASOURCE_USERNAME"
check_env_var "SPRING_DATASOURCE_PASSWORD" "sensitive"
check_env_var "SPRING_DATA_MONGODB_URI"

echo ""
echo "Web Application Configuration:"
echo "=============================="
check_env_var "NEXT_PUBLIC_BROKER_GATEWAY_URL"
check_env_var "NEXT_PUBLIC_DEBUG_MODE"
check_env_var "NEXT_PUBLIC_API_URL"
check_env_var "NEXT_PUBLIC_DEBUG_USER_ALIAS"
check_env_var "NEXT_PUBLIC_DEBUG_USER_EMAIL"

# Count how many required variables are missing
MISSING_COUNT=0
for var in PORT BROKER_GATEWAY_URL IMAGE_SERVER_PORT FS_SERVER_PORT; do
    if [ -z "${!var:-}" ]; then
        ((MISSING_COUNT++))
    fi
done

echo ""
if [ $MISSING_COUNT -eq 0 ]; then
    echo "🎉 All core environment variables are set!"
else
    echo "⚠️  $MISSING_COUNT core environment variables are not set. Consider running: source setup-env.sh"
fi

echo ""
echo "To set up missing environment variables, copy .env.example to .env and customize:"
echo "cp .env.example .env"
echo "Then edit .env with your specific values and run:"
echo "source setup-env.sh"