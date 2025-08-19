name: "Docker Containerization for CCR Qwen Bridge - Persistent Credential Access Implementation"
description: |
  Implement Docker containerization for the CCR Qwen Bridge to enable continuous deployment on any machine while maintaining persistent access to Qwen OAuth credentials

---

## Goal

**Feature Goal**: Containerize the CCR Qwen Bridge application using Docker to enable continuous, reliable deployment on any machine while ensuring persistent access to the Qwen OAuth credentials file at `~/.qwen/oauth_creds.json`

**Deliverable**: Complete Docker implementation including Dockerfile, docker-compose.yml, and deployment documentation that allows the bridge to run continuously with credential persistence

**Success Definition**: The Docker container can be deployed on any machine, maintains access to Qwen credentials, starts automatically on system boot, and can be managed as a service

## User Persona

**Target User**: System administrators and developers who want to deploy the CCR Qwen Bridge as a persistent service

**Use Case**: Running the Qwen Bridge 24/7 on a server or local machine to proxy OpenAI-compatible requests to Qwen API

**User Journey**: 
1. User authenticates with Qwen CLI to generate credentials
2. User builds Docker image with provided Dockerfile
3. User deploys container with proper volume mounting for credential persistence
4. Container starts automatically and maintains token refresh
5. Users can access the bridge at the configured host/port

**Pain Points Addressed**: 
- Complex manual deployment and service management
- Credential file access issues in containerized environments
- Inconsistent behavior across different deployment environments
- Manual restarts and service management overhead

## Why

- **Business Value**: Enables reliable 24/7 operation of the Qwen Bridge for continuous AI assistant access
- **Integration Benefit**: Standardizes deployment across different environments (development, staging, production)
- **Technical Necessity**: Docker provides process isolation, dependency management, and easier deployment
- **User Impact**: Simplifies deployment and reduces operational overhead for users

## What

The implementation must provide:

1. **Docker Containerization**: Multi-stage Dockerfile for secure, efficient container builds
2. **Credential Persistence**: Volume mounting strategy for `~/.qwen/oauth_creds.json` access
3. **Configuration Management**: Environment variable support for all bridge configuration options
4. **Process Management**: Proper container entrypoint with signal handling for graceful shutdowns
5. **Security**: Non-root user execution, minimal base image, proper file permissions
6. **Deployment Orchestration**: Docker Compose configuration for easy deployment

### Success Criteria

- [ ] Multi-stage Dockerfile builds secure, minimal image
- [ ] Container runs as non-root user with proper permissions
- [ ] Credential file accessible via volume mount at `~/.qwen/oauth_creds.json`
- [ ] All configuration options available via environment variables
- [ ] Container starts automatically and handles signals gracefully
- [ ] Docker Compose configuration enables one-command deployment
- [ ] Integration test validates credential access and bridge functionality
- [ ] Documentation updated with Docker deployment instructions

## All Needed Context

### Context Completeness Check

This PRP provides complete context from Docker best practices research, current project analysis, credential persistence requirements, and deployment scenarios.

### Documentation & References

```yaml
# Docker Official Documentation
- url: https://docs.docker.com/language/nodejs/build-images/
  why: Official Docker best practices for Node.js applications
  critical: Multi-stage builds, non-root user execution, .dockerignore patterns
  section: "Build and run your image"

# Node.js Docker Best Practices
- url: https://github.com/nodejs/docker-node/blob/main/docs/BestPractices.md
  why: Community-established patterns for secure Node.js containers
  critical: npm ci for dependency installation, user permissions, signal handling

# Docker Compose Documentation
- url: https://docs.docker.com/compose/
  why: Orchestration for multi-container applications
  critical: Volume mounting, environment variables, service dependencies

# Current Implementation Files for Pattern Reference
- file: /home/dustin/projects/qwen-code-bridge/src/server.js
  why: Main application entry point that needs to run in container
  pattern: Starts Express server, handles graceful shutdown
  gotcha: Uses file-based credential storage that must be accessible

- file: /home/dustin/projects/qwen-code-bridge/src/config-manager.js
  why: Configuration management with environment variable support
  pattern: Environment variable precedence, file path expansion
  gotcha: Home directory path expansion must work in container context

- file: /home/dustin/projects/qwen-code-bridge/DEPLOYMENT.md
  why: Existing deployment documentation for integration
  pattern: systemd service configuration, credential management
  gotcha: Docker deployment should complement existing deployment methods
```

### Current Codebase Tree

```bash
ccr-qwen-bridge/
├── package.json              # Node.js ESM project, Express.js dependencies
├── src/
│   ├── server.js             # Main Express server entry point
│   ├── config-manager.js     # Configuration management with env vars
│   ├── logger.js             # Structured JSON logging  
│   ├── oauth-token-manager.js # OAuth 2.0 token management for Qwen API
│   ├── request-translator.js # OpenAI ↔ Qwen API translation
│   └── error-handler.js      # HTTP error handling middleware
├── test/
│   ├── basic.test.js         # Basic functionality tests
│   ├── config.test.js        # Configuration tests  
│   └── error-handler.test.js # Error handling tests
├── DEPLOYMENT.md             # Existing deployment documentation
└── PRPs/
    └── docker-containerization.md  # THIS FILE - New Docker PRP
```

### Desired Codebase Tree (Files to Add/Modify)

```bash
ccr-qwen-bridge/
├── Dockerfile                # ADD - Multi-stage Docker build configuration
├── docker-compose.yml        # ADD - Docker Compose deployment orchestration
├── .dockerignore             # ADD - Exclude unnecessary files from Docker context
├── DEPLOYMENT.md             # MODIFY - Add Docker deployment section
├── src/
│   └── server.js             # MAYBE MODIFY - Ensure proper signal handling
└── test/
    └── docker.test.js        # ADD - Docker deployment validation tests
```

### Known Gotchas & Library Quirks

```dockerfile
# CRITICAL: Node.js ESM import syntax required (type: "module" in package.json)
# Dockerfile must use .js extensions in imports:
import { QwenCodeBridge } from './server.js';  # Note .js extension required

# CRITICAL: Volume permissions in Docker containers
# Host volume mounts may have permission issues with non-root users
# Solution: Use numeric user IDs for consistency across environments

# CRITICAL: Home directory path expansion differences
# Container home directory is /home/node, not host user's home directory
# Configuration must account for path mapping or use absolute paths

# CRITICAL: Signal handling for graceful shutdowns
# Node.js processes in containers must handle SIGTERM properly
# Current server.js has basic process.exit(1) but may need enhancement

# CRITICAL: Multi-stage build optimization
# npm install should happen in separate layer from source code for caching
# Development dependencies should be excluded from production image
```

## Implementation Blueprint

### Data Models and Structure

Create Docker-specific configuration and deployment structures.

```dockerfile
# Dockerfile structure with multi-stage build
FROM node:18-alpine AS dependencies
# Dependency installation stage

FROM node:18-alpine AS builder
# Source code build stage

FROM node:18-alpine AS runtime
# Minimal runtime stage with non-root user
```

```yaml
# docker-compose.yml structure
version: '3.8'
services:
  qwen-bridge:
    build: .
    ports:
      - "8732:8732"
    volumes:
      - qwen-credentials:/home/node/.qwen
    environment:
      - HOST=0.0.0.0
      - PORT=8732
    restart: unless-stopped
```

### Implementation Tasks (Ordered by Dependencies)

```yaml
Task 1: CREATE .dockerignore
  - IMPLEMENT: Exclude unnecessary files from Docker build context
  - FOLLOW pattern: Standard Node.js .dockerignore with node_modules, logs, etc.
  - NAMING: .dockerignore in project root
  - DEPENDENCIES: None
  - PLACEMENT: Root directory for Docker build context optimization

Task 2: CREATE Dockerfile
  - IMPLEMENT: Multi-stage Docker build with security best practices
  - FOLLOW pattern: Official Docker Node.js best practices with non-root user
  - NAMING: Dockerfile in project root with standard naming
  - DEPENDENCIES: Task 1 for optimized build context
  - PLACEMENT: Root directory for standard Docker build process

Task 3: CREATE docker-compose.yml
  - IMPLEMENT: Docker Compose configuration for easy deployment
  - FOLLOW pattern: Volume mounting for credential persistence, environment variables
  - NAMING: docker-compose.yml in project root
  - DEPENDENCIES: Task 2 for image build reference
  - PLACEMENT: Root directory for standard Docker Compose usage

Task 4: MODIFY DEPLOYMENT.md
  - IMPLEMENT: Add Docker deployment section with instructions
  - FOLLOW pattern: Existing deployment documentation structure
  - NAMING: Append to existing DEPLOYMENT.md
  - DEPENDENCIES: Tasks 1-3 for accurate instructions
  - PLACEMENT: Update existing deployment documentation

Task 5: CREATE test/docker.test.js
  - IMPLEMENT: Integration tests for Docker deployment validation
  - FOLLOW pattern: Existing test structure with Node.js test runner
  - NAMING: docker.test.js in test directory
  - DEPENDENCIES: Tasks 1-4 for testable deployment
  - PLACEMENT: Test directory for validation tests

Task 6: ENHANCE src/server.js (if needed)
  - IMPLEMENT: Improved signal handling for graceful Docker container shutdown
  - FOLLOW pattern: Proper SIGTERM handling for containerized applications
  - NAMING: Update existing server.js signal handlers
  - DEPENDENCIES: None - enhancement only
  - PLACEMENT: Update existing server implementation
```

### Implementation Patterns & Key Details

```dockerfile
# CRITICAL PATTERN: Multi-stage Dockerfile with security best practices
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

# Switch to non-root user
USER nodejs

# Expose port (matches default PORT in config-manager.js)
EXPOSE 8732

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node healthcheck.js

# Define entrypoint
ENTRYPOINT ["node", "src/server.js"]
```

```yaml
# CRITICAL PATTERN: Docker Compose with volume mounting for credentials
version: '3.8'

services:
  qwen-bridge:
    build: .
    container_name: ccr-qwen-bridge
    ports:
      # Host port mapping - external access
      - "${HOST_PORT:-8732}:8732"
    volumes:
      # CRITICAL: Volume mount for credential persistence
      # Maps host ~/.qwen to container /home/node/.qwen
      - qwen-credentials:/home/node/.qwen
    environment:
      # CRITICAL: Environment variables for configuration
      - HOST=0.0.0.0
      - PORT=8732
      - LOG_LEVEL=${LOG_LEVEL:-info}
      - LOG_FORMAT=${LOG_FORMAT:-json}
      - REQUEST_TIMEOUT=${REQUEST_TIMEOUT:-30000}
      # Allow overriding credentials path if needed
      - CREDENTIALS_FILE_PATH=/home/node/.qwen/oauth_creds.json
    restart: unless-stopped
    # CRITICAL: Health check matching server health endpoint
    healthcheck:
      test: ["CMD", "wget", "--quiet", "--tries=1", "--spider", "http://localhost:8732/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s

volumes:
  # Named volume for credential persistence
  qwen-credentials:
```

```dockerignore
# CRITICAL PATTERN: .dockerignore for optimized build context
node_modules
npm-debug.log
.git
.gitignore
README.md
.env
.nyc_output
coverage
.nyc_output
.coverage
.coverage/
*.log
logs
*.tgz
.DS_Store
.dockerignore
docker-compose.yml
docker-compose.override.yml
```

```javascript
// CRITICAL PATTERN: Signal handling in server.js (if enhancement needed)
// Add proper signal handling for graceful shutdown in Docker containers
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  server.close(() => {
    logger.info('Process terminated');
    process.exit(0);
  });
  
  // Force shutdown after 10 seconds
  setTimeout(() => {
    logger.error('Could not close connections in time, forcefully shutting down');
    process.exit(1);
  }, 10000);
});
```

### Integration Points

```yaml
CREDENTIALS:
  - volume: Named Docker volume "qwen-credentials" for persistent storage
  - path: Container /home/node/.qwen mapped to host volume
  - permissions: 600 file permissions for oauth_creds.json
  - pattern: Host credentials created by qwen auth CLI before container start

CONFIGURATION:
  - environment: All config options available as environment variables
  - pattern: CREDENTIALS_FILE_PATH set to container path /home/node/.qwen/oauth_creds.json
  - pattern: HOST set to 0.0.0.0 for container network access
  - pattern: PORT matches EXPOSE in Dockerfile

NETWORKING:
  - port: Container port 8732 mapped to configurable host port
  - binding: Host binding allows external access to bridge
  - pattern: Health check endpoint at /health for container monitoring

DEPLOYMENT:
  - compose: docker-compose.yml for one-command deployment
  - restart: unless-stopped policy for automatic restart on system boot
  - health: Built-in health checking for container orchestration
```

## Validation Loop

### Level 1: Syntax & Style (Immediate Feedback)

```bash
# Validate Dockerfile syntax
docker run --rm -i hadolint/hadolint < Dockerfile
# Expected: No warnings or errors

# Validate docker-compose.yml syntax
docker-compose config
# Expected: Valid configuration output with no errors

# Validate .dockerignore exists and has correct patterns
cat .dockerignore | grep -E "(node_modules|\.git|\.env)"
# Expected: Critical ignore patterns present

# Check Docker build context size (should be reasonable)
du -sh . | grep -v node_modules
# Expected: Build context under 10MB
```

### Level 2: Unit Tests (Component Validation)

```bash
# Test Docker image builds successfully
docker build -t ccr-qwen-bridge:test .
# Expected: Successful multi-stage build with no errors

# Test Docker image runs basic syntax check
docker run --rm ccr-qwen-bridge:test node --check src/server.js
# Expected: No syntax errors

# Test Docker image has correct user permissions
docker run --rm ccr-qwen-bridge:test id
# Expected: User nodejs (1001) not root

# Test environment variable inheritance
docker run --rm -e TEST_VAR=test ccr-qwen-bridge:test env | grep TEST_VAR
# Expected: Environment variables properly inherited
```

### Level 3: Integration Testing (System Validation)

```bash
# Full system integration testing with docker-compose
# 1. Create test credentials directory
mkdir -p ~/.qwen-test

# 2. Create dummy credentials file
echo '{"access_token":"test","refresh_token":"test","expiry_date":1234567890}' > ~/.qwen-test/oauth_creds.json

# 3. Start service with test credentials
QWEN_CREDENTIALS_PATH="$HOME/.qwen-test" docker-compose up -d

# 4. Wait for startup
sleep 5

# 5. Test health endpoint
curl -f http://localhost:8732/health
# Expected: 200 OK with JSON health response

# 6. Test credential file access
docker-compose exec qwen-bridge ls -la /home/node/.qwen/
# Expected: oauth_creds.json file accessible

# 7. Test configuration environment variables
docker-compose exec qwen-bridge printenv | grep -E "(HOST|PORT|LOG_LEVEL)"
# Expected: Environment variables properly set

# 8. Cleanup
docker-compose down
rm -rf ~/.qwen-test
```

### Level 4: Real-World Validation (Production Deployment)

```bash
# Production deployment validation

# 1. Real credential validation (requires prior qwen auth)
# Ensure user has run qwen auth to create real credentials
ls -la ~/.qwen/oauth_creds.json
# Expected: Real credentials file exists

# 2. Deploy with real credentials
docker-compose up -d

# 3. Monitor container logs for startup
docker-compose logs --tail=50

# 4. Test actual Qwen API connectivity (requires valid credentials)
curl -X POST http://localhost:8732/health \
  -H "Content-Type: application/json" \
  | jq '.'
# Expected: Healthy status response

# 5. Test restart behavior
docker-compose restart
# Expected: Container restarts successfully

# 6. Test system reboot persistence
# (This would be tested by actually rebooting the system)
# Expected: Container starts automatically after reboot

# 7. Validate file permissions
docker-compose exec qwen-bridge stat -c "%a %U:%G" /home/node/.qwen/oauth_creds.json
# Expected: 600 permissions, nodejs:nodejs ownership

# 8. Stress test with actual API requests
# This would require a real OpenAI-compatible client connecting to the bridge
```

## Final Validation Checklist

### Technical Validation

- [ ] Dockerfile builds without errors: `docker build -t ccr-qwen-bridge:test .`
- [ ] Multi-stage build creates minimal image
- [ ] Non-root user execution verified
- [ ] .dockerignore excludes unnecessary files
- [ ] Docker Compose configuration validates: `docker-compose config`
- [ ] Container starts successfully with `docker-compose up`

### Feature Validation

- [ ] Volume mounting enables credential file access
- [ ] Environment variables control all configuration options
- [ ] Container listens on correct port and binds to 0.0.0.0
- [ ] Health check endpoint responds correctly
- [ ] Signal handling allows graceful shutdown
- [ ] Restart policy enables automatic startup

### Code Quality Validation

- [ ] Dockerfile follows security best practices
- [ ] Multi-stage build optimizes image size
- [ ] .dockerignore minimizes build context
- [ ] Docker Compose uses named volumes for persistence
- [ ] Environment variable names match existing configuration
- [ ] No hardcoded values that should be configurable

### Real-World Integration

- [ ] Documentation includes Docker deployment instructions
- [ ] Integration test validates credential persistence
- [ ] Deployment works with real Qwen credentials
- [ ] Container can be managed as a service
- [ ] Automatic restart works on system reboot
- [ ] File permissions secure credential access

---

## Anti-Patterns to Avoid

- ❌ Don't run container as root user - security risk
- ❌ Don't include node_modules in Docker image - use npm ci instead
- ❌ Don't hardcode host paths in Docker Compose - use named volumes
- ❌ Don't expose unnecessary ports - only expose required service ports
- ❌ Don't include development dependencies in production image
- ❌ Don't ignore signal handling - containers need graceful shutdown
- ❌ Don't use latest tag for base images - specify version for reproducibility

## Confidence Score: 9/10

This PRP provides comprehensive guidance for Docker containerization with a focus on credential persistence, following established best practices for Node.js applications. The implementation plan covers all critical aspects including security, configuration management, and deployment orchestration. The validation approach ensures both technical correctness and real-world usability. The main consideration is ensuring cross-platform volume mounting works consistently, but the use of named volumes should address most compatibility issues.