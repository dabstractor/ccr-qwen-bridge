# Claude Bridge for Claude Code Router

Use free daily API quotas from multiple AI providers with your Claude Code Router.

## Quick Start (5 Minutes)

### 1. Install CLI Tools & Authenticate

**For Qwen (required):**
```bash
npm install -g @qwen-code/qwen-code@latest
qwen auth
```

**For Gemini (optional):**
```bash
npm install -g @google/gemini-cli
gemini auth
```

### 2. Set Up Credentials

```bash
git clone https://github.com/dabstractor/ccr-qwen-bridge
cd ccr-qwen-bridge
npm run setup
```

### 3. Start the Service

**Option A: Run in terminal (stops when you close terminal)**
```bash
npm install
npm start
```

**Option B: Run in background forever (recommended)**
```bash
docker-compose up -d
```

That's it! Your bridge is now running and ready to use with Claude Code Router.

### 4. Configure Claude Code Router

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

## Management Commands

### Docker Management
```bash
# View logs
docker-compose logs -f

# Stop service
docker-compose down

# Restart service
docker-compose restart

# Update to latest version
git pull && docker-compose up -d --build
```

### Health Check
```bash
curl http://localhost:31337/health
```