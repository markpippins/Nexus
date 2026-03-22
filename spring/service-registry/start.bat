@echo off
REM Service Registry Startup Script

echo Starting Service Registry...
echo Port: 8085
echo H2 Console: http://localhost:8085/h2-console
echo.

cd /d "%~dp0"

REM Check if Maven is available
where mvn >nul 2>nul
if %ERRORLEVEL% EQU 0 (
    mvn spring-boot:run
) else (
    echo Maven not found. Please install Maven or use the Maven wrapper.
    exit /b 1
)
