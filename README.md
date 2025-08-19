# Claude Bridge for Claude Code Router

Use free daily API quotas from multiple AI providers with your Claude Code Router.

## Setup

### 1. Prerequisites

- **Node.js 18+** installed
- **Authenticate with provider CLIs first:**

**For Qwen:**
```bash
npm install -g @qwen-code/qwen-code@latest
qwen auth
```

**For Gemini (if enabled):**
```bash
# Gemini CLI authentication process (example)
gcloud auth application-default login
```

### 2. Install and Start

#### Option A: Standard Installation (Manual Start/Stop)

```bash
git clone https://github.com/dabstractor/ccr-qwen-bridge
cd ccr-qwen-bridge
npm install
npm start
```

The server will start on `localhost:8732` by default.

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
      "name": "qwen/qwen3-coder-plus",
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
      "name": "qwen/qwen3-coder-flash",
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
      "name": "gemini/gemini-pro",
      "transformer": {
        "use": [
          [
            "maxtoken",
            {
              "max_tokens": 32768
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
  "default": "claude-bridge,qwen/qwen3-coder-plus",
  "background": "claude-bridge,qwen/qwen3-coder-flash",
  "think": "claude-bridge,qwen/qwen3-coder-plus",
  "longContext": "claude-bridge,gemini/gemini-pro"
}
```

That's it! Your Claude Code Router will now use multiple providers' free API quotas.

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

# Authentication
CREDENTIALS_FILE_PATH=~/.qwen/oauth_creds.json

# Logging
LOG_LEVEL=info
LOG_FORMAT=console
REQUEST_TIMEOUT=30000

# Provider Configuration

# Qwen Provider (enabled by default)
PROVIDER_QWEN_ENABLED=true
PROVIDER_QWEN_CREDENTIALS_PATH=~/.qwen/oauth_creds.json
PROVIDER_QWEN_DEFAULT_MODEL=qwen3-coder-plus
# PROVIDER_QWEN_API_BASE_URL is auto-detected from OAuth response, leave empty for auto-detection
PROVIDER_QWEN_REQUEST_TIMEOUT=30000

# Gemini Provider (disabled by default)
PROVIDER_GEMINI_ENABLED=false
PROVIDER_GEMINI_CREDENTIALS_PATH=~/.gemini/oauth_creds.json
PROVIDER_GEMINI_DEFAULT_MODEL=gemini-pro
PROVIDER_GEMINI_CLIENT_ID=your-gemini-client-id-here
PROVIDER_GEMINI_API_BASE_URL=https://generativelanguage.googleapis.com/v1
PROVIDER_GEMINI_REQUEST_TIMEOUT=30000

# Development/Production
NODE_ENV=development
```

### Enable Additional Providers

To enable Gemini support:
1. Set `PROVIDER_GEMINI_ENABLED=true`
2. Configure `PROVIDER_GEMINI_CLIENT_ID` with your Gemini API client ID
3. Authenticate with the Gemini CLI
4. Restart the server

### Common Issues

**"Credentials file not found"**
- Run the appropriate auth command for each provider first

**"Invalid refresh token"**
- Re-run the auth command for the affected provider

**"No enabled provider found"**
- Check that at least one provider is enabled in your configuration

### Health Check

```bash
# Standard installation
curl http://localhost:8732/health

# Docker deployment
curl http://localhost:31337/health
```

The health check will show the status of all configured providers.

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