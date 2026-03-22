# User Service

The User Service is a microservice responsible for managing user-related operations in the Nexus platform.

## Overview

This service provides functionality for:
- User management (create, read, update, delete)
- Profile management
- Post and comment management
- Forum interactions
- Reactions and ratings

## Database

This service uses MongoDB as its primary data store instead of a relational database. The document-based approach allows for more flexible data modeling and better performance for the social features.

## Configuration

The service connects to MongoDB using the following configuration in `application.properties`:
```
spring.data.mongodb.uri=mongodb://mongoUser:somePassword@localhost:27017/userservice?authSource=admin
```

## Running with MongoDB

### Prerequisites
- Docker installed

### Running MongoDB with Docker

The Nexus platform provides convenient scripts to start MongoDB:

**On Windows:**
```bash
mongodb-docker-start.bat
```

**On Linux/Mac:**
```bash
./mongodb-docker-start.sh
```

Alternatively, you can start MongoDB manually with:

```bash
docker run --name nexus-mongodb -p 27017:27017 -e MONGO_INITDB_ROOT_USERNAME=mongoUser -e MONGO_INITDB_ROOT_PASSWORD=somePassword -d mongo:latest
```

Or use a docker-compose file:

```yaml
version: '3.8'
services:
  mongodb:
    image: mongo:latest
    container_name: nexus-mongodb
    ports:
      - "27017:27017"
    environment:
      MONGO_INITDB_ROOT_USERNAME: mongoUser
      MONGO_INITDB_ROOT_PASSWORD: somePassword
    volumes:
      - mongodb_data:/data/db

volumes:
  mongodb_data:
```

### Running the Service
Once MongoDB is running, you can start the user service with:

```bash
mvn spring-boot:run
```

## MongoDB Collections

The service uses the following collections:
- `users`: Stores user information and relationships
- `profiles`: Stores user profile details
- `posts`: Contains posts made by users
- `comments`: Stores comments on posts
- `reactions`: Tracks user reactions to posts/comments
- `edits`: Stores edit history for content
- `interests`: User interests and tags
- `forums`: Forum information

## Features

- User registration and authentication
- Profile management
- Creating and managing posts
- Commenting on posts
- Reacting to content (like, love, anger, sadness, surprise)
- Following other users
- Forum participation
- Content rating system

## API

The service exposes operations through the broker pattern, allowing for flexible integration with other services in the Nexus platform.