@echo off
echo Starting MongoDB container...

docker run -d ^
  --name atomic-mongodb ^
  -p 27017:27017 ^
  -e MONGO_INITDB_ROOT_USERNAME=mongoUser ^
  -e MONGO_INITDB_ROOT_PASSWORD=somePassword ^
  -v mongodb_data:/data/db ^
  mongo:latest

echo Waiting for MongoDB to be ready...
timeout /t 10 /nobreak >nul

echo MongoDB container started successfully!
echo Connection string: mongodb://mongoUser:somePassword@localhost:27017/?authSource=admin
echo.
echo Databases will be created automatically when applications connect.
echo Make sure to update your application.properties files with this connection info if needed.