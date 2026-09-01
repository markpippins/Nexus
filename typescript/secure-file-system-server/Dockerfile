FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy source code
COPY . .

# Create fs_root directory
RUN mkdir -p fs_root

# Expose port
EXPOSE 4040

# Run the application
# Drop privileges: the base image runs as root by default.
RUN chown -R node:node /app
USER node
CMD ["npm", "start"]
