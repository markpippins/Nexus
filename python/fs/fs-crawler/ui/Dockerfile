FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies (no lockfile in repo — install resolves fresh)
RUN npm install

# Copy source code
COPY . .

# Expose port
EXPOSE 3004

# Start development server
# Drop privileges: the base image runs as root by default.
RUN chown -R node:node /app
USER node
CMD ["npm", "run", "dev"]
