# Use official Node.js 20 LTS as base image (aligns with project Node version)
FROM node:20-alpine

# Install build dependencies
RUN apk add --no-cache python3 make g++

# Create app directory
WORKDIR /app

# Copy package files for dependency installation
COPY package*.json ./

# Install dependencies - npm handles file:../heartbeat-client when context includes sibling
RUN npm ci

# Copy source code
COPY . .

# Build TypeScript
RUN npm run build

# Expose the default port
EXPOSE 3104

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3104/health || exit 1

# Run the service
CMD ["npm", "run", "start"]
