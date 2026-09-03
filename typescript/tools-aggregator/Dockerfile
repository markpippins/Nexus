FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package.json package-lock.json ./

# Install dependencies
RUN npm ci --omit=dev

# Copy source and build
COPY src ./src
COPY tsconfig.json ./
RUN npm run build

# Expose port
EXPOSE 3210

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3210/health', (r) => {if (r.statusCode !== 200) throw new Error(r.statusCode)})"

# Start the service
# Drop privileges: the base image runs as root by default.
RUN chown -R node:node /app
USER node
CMD ["npm", "start"]
