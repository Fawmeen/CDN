# Use lightweight LTS Node image
FROM node:20-alpine

# Create app directory
WORKDIR /usr/src/app

# Install package dependencies
COPY package*.json ./
RUN npm ci --only=production

# Copy application source code
COPY . .

# Expose ports
# 5000: Edge Cache (CDN) Server / Frontend Dashboard
# 9000: Origin Database Server
EXPOSE 5000
EXPOSE 9000

# Default execution starts the Edge Cache (CDN) Server
CMD ["node", "src/server.js"]
