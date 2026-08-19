# Use Bun runtime for TypeScript in assembly-srv
FROM oven/bun:1-alpine

# Install build dependencies
RUN apk add --no-cache python3 make g++ git

# Create app directory
WORKDIR /app

# Copy package files for dependency installation
COPY package*.json ./

# Install dependencies - bun handles file:../heartbeat-client when context includes sibling
RUN bun install --production

# Copy source code
COPY . .

# Build TypeScript
RUN bun run build

# Expose the default port
EXPOSE 8080

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:8080/health || exit 1

# Run the service
CMD ["bun", "run", "start"]
