# PowerShell development script to start Redis for the Atomic platform

Write-Host "Starting Redis for Atomic platform development..." -ForegroundColor Green

# Check if Redis is already running
$redisProcesses = Get-Process -Name "redis-server" -ErrorAction SilentlyContinue
if ($redisProcesses) {
    Write-Host "Redis is already running. Stopping it first..." -ForegroundColor Yellow
    Stop-Process -Name "redis-server" -Force
    Start-Sleep -Seconds 2
}

# Check if Docker is available  
if (Get-Command "docker" -ErrorAction SilentlyContinue) {
    Write-Host "Using Docker to start Redis..." -ForegroundColor Cyan
    
    # Stop any existing Redis container with the same name
    $existingContainer = docker ps -aq --filter "name=atomic-redis-dev"
    if ($existingContainer) {
        docker stop atomic-redis-dev 2>$null
        docker rm atomic-redis-dev 2>$null
    }
    
    # Run Redis in Docker
    docker run --name atomic-redis-dev -p 6379:6379 -d redis:latest
    
    # Wait for Redis to be ready
    Start-Sleep -Seconds 3
    
    # Check if container is running
    if (docker ps | Select-String "atomic-redis-dev") {
        Write-Host "Redis started successfully via Docker." -ForegroundColor Green
        Write-Host "Redis is available at localhost:6379" -ForegroundColor Green
    } else {
        Write-Host "Failed to start Redis via Docker." -ForegroundColor Red
        exit 1
    }
} 
# Check if redis-server executable exists in PATH
elseif (Get-Command "redis-server" -ErrorAction SilentlyContinue) {
    Write-Host "Starting Redis server directly..." -ForegroundColor Cyan
    
    # Try to start Redis server directly
    Start-Process -FilePath "redis-server" -ArgumentList "--port 6379"
    
    # Wait for startup
    Start-Sleep -Seconds 2
    
    # Test the connection
    try {
        $testResult = & redis-cli -p 6379 ping 2>$null
        if ($testResult -eq "PONG") {
            Write-Host "Redis started successfully." -ForegroundColor Green
            Write-Host "Redis is available at localhost:6379" -ForegroundColor Green
        } else {
            Write-Host "Redis failed to start properly." -ForegroundColor Red
            exit 1
        }
    } catch {
        Write-Host "Redis failed to start properly." -ForegroundColor Red
        exit 1
    }
} 
else {
    Write-Host "Neither Docker nor direct redis-server installation found." -ForegroundColor Red
    Write-Host "Please install either Redis server or Docker to run Redis." -ForegroundColor Red
    exit 1
}

Write-Host "Redis startup completed!" -ForegroundColor Green