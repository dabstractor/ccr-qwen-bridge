# CCR Qwen Bridge Deployment Guide

This guide covers various deployment options for the CCR Qwen Bridge server.

## Prerequisites

### System Requirements
- **Node.js 18+** - Required runtime environment
- **2GB RAM minimum** - For stable operation under load
- **Authenticated Qwen CLI** - Must have valid `~/.qwen/oauth_creds.json`

### Pre-Deployment Setup

1. **Authenticate with Qwen CLI:**
```bash
# Install official qwen-code CLI
npm install -g qwen-code

# Authenticate to generate credentials
qwen auth
```

2. **Verify credentials exist:**
```bash
ls -la ~/.qwen/oauth_creds.json
# Should show a JSON file with recent timestamp
```

## Local Development

### Quick Start
```bash
git clone <repository-url>
cd ccr-qwen-bridge
npm install
npm start
```

### With Custom Configuration
```bash
# Create configuration file
cat > .env << EOF
HOST=localhost
PORT=31337
LOG_LEVEL=debug
LOG_FORMAT=console
EOF

npm start
```

## Production Deployment

### 1. Direct Server Deployment

#### Ubuntu/Debian Server
```bash
# Install Node.js 18+
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Clone and setup
git clone <repository-url> /opt/ccr-qwen-bridge
cd /opt/ccr-qwen-bridge
npm install --only=production

# Create production configuration
sudo tee /opt/ccr-qwen-bridge/.env << EOF
HOST=0.0.0.0
PORT=31337
LOG_LEVEL=info
LOG_FORMAT=json
REQUEST_TIMEOUT=30000
CREDENTIALS_FILE_PATH=/home/qwen/.qwen/oauth_creds.json
EOF

# Create systemd service
sudo tee /etc/systemd/system/qwen-bridge.service << EOF
[Unit]
Description=CCR Qwen Bridge OAuth Proxy
After=network.target

[Service]
Type=simple
User=qwen
WorkingDirectory=/opt/ccr-qwen-bridge
ExecStart=/usr/bin/node src/server.js
Restart=always
RestartSec=10
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
EOF

# Enable and start service
sudo systemctl enable qwen-bridge
sudo systemctl start qwen-bridge
sudo systemctl status qwen-bridge
```

### 2. Docker Deployment

Docker provides an easy way to deploy the CCR Qwen Bridge with persistent credential access across different environments.

#### Prerequisites

1. **Docker Engine** - Install Docker on your system
2. **Docker Compose** - Included with Docker Desktop or install separately
3. **Authenticated Qwen CLI** - Must have valid `~/.qwen/oauth_creds.json`

#### Quick Start with Docker Compose

```bash
# Clone the repository
git clone <repository-url>
cd ccr-qwen-bridge

# Ensure you have valid credentials from qwen auth
ls -la ~/.qwen/oauth_creds.json
# Should show a JSON file with recent timestamp

# Start the service with Docker Compose
docker-compose up -d

# Check service status
docker-compose ps

# View logs
docker-compose logs -f
```

#### Configuration

The Docker deployment uses environment variables for configuration. You can override defaults by creating a `.env` file:

```bash
# Create environment file
cat > .env << EOF
HOST_PORT=31337
LOG_LEVEL=info
LOG_FORMAT=json
REQUEST_TIMEOUT=30000
EOF
```

Available environment variables:
- `HOST_PORT` - Host port to map to container (default: 31337)
- `LOG_LEVEL` - Logging level (default: info)
- `LOG_FORMAT` - Log format (console or json, default: json)
- `REQUEST_TIMEOUT` - Request timeout in milliseconds (default: 30000)

#### Volume Management

The Docker Compose configuration uses a bind mount to access your host's Qwen credentials:

```bash
# Verify host credentials exist
ls -la ~/.qwen/oauth_creds.json

# Check container can access credentials
docker-compose exec qwen-bridge ls -la /home/node/.qwen/oauth_creds.json

# Backup credentials (standard file copy)
cp ~/.qwen/oauth_creds.json ~/.qwen/oauth_creds.json.backup
```

#### Manual Docker Commands

If you prefer to run Docker directly without Compose:

```bash
# Build the image
docker build -t ccr-qwen-bridge .

# Run with credential bind mounting
docker run -d \
  --name qwen-bridge \
  -p 31337:31337 \
  -v $HOME/.qwen:/home/node/.qwen \
  -e HOST=0.0.0.0 \
  -e PORT=31337 \
  -e LOG_LEVEL=info \
  --restart unless-stopped \
  ccr-qwen-bridge

# View logs
docker logs -f qwen-bridge
```

#### Credential Setup for Docker

Before starting the Docker container, ensure you have valid Qwen credentials:

```bash
# Install official qwen-code CLI
npm install -g qwen-code

# Authenticate to generate credentials
qwen auth

# Verify credentials exist
ls -la ~/.qwen/oauth_creds.json

# Secure credentials file (recommended)
chmod 600 ~/.qwen/oauth_creds.json
```

The Docker Compose configuration automatically maps your host `~/.qwen` directory to the container, so existing credentials will be available to the containerized application.

#### Health Monitoring

```bash
# Check container health status
docker inspect --format='{{json .State.Health}}' ccr-qwen-bridge

# Basic health check
curl http://localhost:31337/health

# Detailed status with JSON logs
curl http://localhost:31337/health | jq '.'
```

#### Updating the Docker Deployment

```bash
# Pull latest changes
git pull origin main

# Rebuild and restart
docker-compose down
docker-compose up -d --build

# Or update running container
docker-compose pull
docker-compose up -d
```

#### Troubleshooting Docker Issues

```bash
# Check if container is running
docker-compose ps

# View container logs
docker-compose logs --tail=100

# Check credential file access
docker-compose exec qwen-bridge ls -la /home/node/.qwen/

# Test credential file content
docker-compose exec qwen-bridge cat /home/node/.qwen/oauth_creds.json

# Check environment variables
docker-compose exec qwen-bridge env | grep -E "(HOST|PORT|LOG)"

# Restart container
docker-compose restart
```

### 3. Reverse Proxy Setup

#### Nginx Configuration
```nginx
server {
    listen 80;
    server_name your-domain.com;
    
    location / {
        proxy_pass http://localhost:31337;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        
        # Increase timeouts for long completions
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }
}
```

#### Apache Configuration
```apache
<VirtualHost *:80>
    ServerName your-domain.com
    
    ProxyPreserveHost On
    ProxyRequests Off
    ProxyPass / http://localhost:31337/
    ProxyPassReverse / http://localhost:31337/
    
    # Increase timeouts
    ProxyTimeout 60
</VirtualHost>
```

## Configuration Management

### Environment-Specific Configs

#### Development (.env.development)
```bash
HOST=localhost
PORT=31337
LOG_LEVEL=debug
LOG_FORMAT=console
REQUEST_TIMEOUT=30000
```

#### Production (.env.production)
```bash
HOST=0.0.0.0
PORT=31337
LOG_LEVEL=info
LOG_FORMAT=json
REQUEST_TIMEOUT=45000
NODE_ENV=production
```

#### Load configuration by environment:
```bash
# Development
cp .env.development .env
npm start

# Production
cp .env.production .env
npm start
```

## Security Considerations

### File Permissions
```bash
# Secure credentials file
chmod 600 ~/.qwen/oauth_creds.json
chown $USER:$USER ~/.qwen/oauth_creds.json

# Secure configuration
chmod 600 .env
```

### Firewall Rules
```bash
# Allow only necessary ports
sudo ufw allow 31337/tcp  # Bridge server
sudo ufw allow 22/tcp    # SSH
sudo ufw allow 80/tcp    # HTTP (if using reverse proxy)
sudo ufw allow 443/tcp   # HTTPS (if using reverse proxy)
sudo ufw enable
```

### Network Security
- **Internal network only:** Bind to `127.0.0.1` for local-only access
- **Reverse proxy:** Use nginx/apache for HTTPS termination
- **API key protection:** The bridge ignores API keys, but ensure clients use dummy values

## Monitoring & Maintenance

### Health Monitoring
```bash
# Basic health check
curl http://localhost:31337/health

# Detailed status with JSON logs
curl http://localhost:31337/health | jq '.'
```

### Log Management
```bash
# With systemd (production)
journalctl -u qwen-bridge -f

# Direct process logs
tail -f /var/log/qwen-bridge.log

# JSON log parsing
tail -f /var/log/qwen-bridge.log | jq '.level,.message'
```

### Token Refresh Monitoring
```bash
# Monitor for auth errors
journalctl -u qwen-bridge | grep -i "token\|auth\|expired"

# Watch for fatal errors requiring re-auth
journalctl -u qwen-bridge | grep "FATAL"
```

### Performance Monitoring
```bash
# Monitor resource usage
htop -p $(pgrep -f "qwen-bridge")

# Check open connections
netstat -an | grep :31337

# Monitor response times
curl -w "@curl-format.txt" http://localhost:31337/health
```

## Troubleshooting

### Common Issues

#### 1. "Credentials file not found"
```bash
# Verify credentials exist
ls -la ~/.qwen/oauth_creds.json

# Re-authenticate if missing
qwen auth

# Check file permissions
chmod 600 ~/.qwen/oauth_creds.json
```

#### 2. "Invalid refresh token"
```bash
# Re-authenticate with official CLI
qwen auth

# Restart bridge service
sudo systemctl restart qwen-bridge
```

#### 3. Server won't start
```bash
# Check port availability
sudo netstat -tlnp | grep :31337

# Check configuration
node -c src/server.js

# Review logs
journalctl -u qwen-bridge --no-pager -l
```

#### 4. High memory usage
```bash
# Monitor Node.js heap
node --inspect src/server.js

# Restart service periodically (if needed)
sudo systemctl restart qwen-bridge
```

### Debug Mode
```bash
# Enable debug logging
echo "LOG_LEVEL=debug" >> .env

# Start with debug output
DEBUG=* npm start

# Analyze request/response flow
curl -v http://localhost:31337/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"model":"qwen3-coder-plus","messages":[{"role":"user","content":"test"}]}'
```

## Backup & Recovery

### Backup Credentials
```bash
# Create backup directory
mkdir -p ~/.qwen/backups

# Backup credentials with timestamp
cp ~/.qwen/oauth_creds.json ~/.qwen/backups/oauth_creds_$(date +%Y%m%d_%H%M%S).json

# Automated daily backup
echo "0 2 * * * cp ~/.qwen/oauth_creds.json ~/.qwen/backups/oauth_creds_\$(date +\\%Y\\%m\\%d).json" | crontab -
```

### Recovery Procedure
```bash
# Restore from backup
cp ~/.qwen/backups/oauth_creds_YYYYMMDD.json ~/.qwen/oauth_creds.json

# Verify and restart
chmod 600 ~/.qwen/oauth_creds.json
sudo systemctl restart qwen-bridge
curl http://localhost:8000/health
```

## Scaling Considerations

### Load Balancing
- The bridge is stateless except for credential file access
- Multiple instances can run with shared credentials (with file locking in Phase 3)
- Use nginx upstream for load distribution

### Performance Tuning
```bash
# Increase Node.js memory limit for high load
node --max-old-space-size=2048 src/server.js

# Optimize for production
NODE_ENV=production npm start
```

### Resource Limits
```bash
# Set systemd resource limits
sudo tee -a /etc/systemd/system/qwen-bridge.service << EOF
[Service]
MemoryLimit=1G
CPUQuota=50%
LimitNOFILE=65536
EOF

sudo systemctl daemon-reload
sudo systemctl restart qwen-bridge
```

## Updates & Maintenance

### Updating the Bridge
```bash
# Backup current version
cp -r /opt/ccr-qwen-bridge /opt/ccr-qwen-bridge.backup

# Pull updates
cd /opt/ccr-qwen-bridge
git pull origin main
npm install --only=production

# Test configuration
npm test

# Restart service
sudo systemctl restart qwen-bridge
```

### Credential Rotation
```bash
# Re-authenticate (creates new tokens)
qwen auth

# Verify new credentials work
curl http://localhost:8000/health

# Monitor logs for successful token use
journalctl -u qwen-bridge -f | grep "token"
```