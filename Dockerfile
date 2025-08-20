# Multi-stage Dockerfile for CCR Qwen Bridge

# Stage 1: Dependencies
FROM node:18-alpine AS dependencies
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production && npm cache clean --force

# Stage 2: Runtime
FROM node:18-alpine AS runtime

# Create non-root user
RUN addgroup --g 1001 --system nodejs && \
    adduser --u 1001 --system --ingroup nodejs nodejs

WORKDIR /app

# Copy dependencies from previous stage
COPY --from=dependencies /app/node_modules ./node_modules

# Copy source code
COPY --chown=nodejs:nodejs . .

# Fix permissions for mounted volumes
RUN mkdir -p /home/nodejs/.qwen /home/nodejs/.gemini && \
    chown -R nodejs:nodejs /home/nodejs/.qwen /home/nodejs/.gemini

# Switch to non-root user
USER nodejs

# Expose port (matches default PORT in config-manager.js)
EXPOSE 31337

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node healthcheck.js

# Define entrypoint
ENTRYPOINT ["node", "src/server.js"]