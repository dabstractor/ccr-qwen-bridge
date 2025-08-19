# Qwen Code Bridge for Claude Code Router

Use Qwen's free daily API quota with your Claude Code Router.

## Setup

### 1. Prerequisites

- **Node.js 18+** installed
- **Authenticate with Qwen CLI first:**
  ```bash
  npm install -g @qwen-code/qwen-code@latest
  qwen auth
  ```

### 2. Install and Start

#### Option A: Standard Installation (Manual Start/Stop)

```bash
git clone https://github.com/dabstractor/ccr-qwen-bridge
cd ccr-qwen-bridge
npm install
npm start
```

The server will start on `localhost:31337` by default.

#### Option B: Docker Deployment (Start Once, Run Forever)

**Perfect for permanent deployment - set it up once and forget about it!**

```bash
git clone https://github.com/dabstractor/ccr-qwen-bridge
cd ccr-qwen-bridge

# Start the service with Docker Compose
docker-compose up -d
```

The Docker deployment provides:
- **Persistent operation**: Automatically restarts on system reboot
- **No manual management**: Just start once and leave running forever
- **Isolated environment**: Runs in its own container with all dependencies
- **Easy updates**: Simple `docker-compose up -d --build` to update
- **Health monitoring**: Built-in health checks and container monitoring

The server will start on `localhost:31337` by default with Docker.

### 3. Configure Claude Code Router

Add this to your `~/.claude-code-router/config.json`:

**Under "Providers":**
```json
{
  "name": "claude-bridge",
  "api_base_url": "http://localhost:31337/v1/chat/completions",
  "models": [
    {
      "name": "qwen3-coder-plus",
      "transformer": {
        "use": [
          [
            "maxtoken",
            {
              "max_tokens": 262144
            }
          ]
        ]
      }
    },
    {
      "name": "qwen3-coder-flash",
      "transformer": {
        "use": [
          [
            "maxtoken",
            {
              "max_tokens": 262144
            }
          ]
        ]
      }
    }
  ]
}
```

**Under "Router":**
```json
"Router": {
  "default": "qwen-bridge,qwen3-coder-plus",
  "background": "qwen-bridge,qwen3-coder-flash",
  "think": "qwen-bridge,qwen3-coder-plus",
  "longContext": "qwen-bridge,qwen3-coder-plus"
}
```

That's it! Your Claude Code Router will now use Qwen's free API quota.

## Configuration

### Change Port or Host

Create a `.env` file:
```bash
cp .env.example .env
```

Edit the `.env` file:
```
# Server Configuration
HOST=localhost
PORT=31337
LOG_LEVEL=info
LOG_FORMAT=console

# API Configuration
REQUEST_TIMEOUT=30000
# QWEN_API_BASE_URL is auto-detected from OAuth response, leave empty for auto-detection

# Development/Production
NODE_ENV=development
```

### Common Issues

**"Credentials file not found"**
- Run `qwen auth` first

**"Invalid refresh token"**
- Re-run `qwen auth`

### Health Check

```bash
# Standard installation
curl http://localhost:31337/health

# Docker deployment
curl http://localhost:31337/health
```

### Docker Management

If you chose the Docker deployment option, use these commands:

```bash
# View container status
docker-compose ps

# View logs
docker-compose logs -f

# Stop the service
docker-compose down

# Restart the service
docker-compose restart

# Update to latest version
git pull && docker-compose up -d --build
```

For more deployment options and advanced configuration, see [DEPLOYMENT.md](DEPLOYMENT.md).
