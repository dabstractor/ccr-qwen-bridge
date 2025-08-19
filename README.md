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

```bash
git clone https://github.com/dabstractor/ccr-qwen-bridge
cd ccr-qwen-bridge
npm install
npm start
```

The server will start on `localhost:31337` by default.

### 3. Configure Claude Code Router

Add this to your `~/.claude-code-router/config.json`:

**Under "Providers":**
```json
{
  "name": "qwen-bridge",
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
HOST=localhost
PORT=31337
```

### Common Issues

**"Credentials file not found"**
- Run `qwen auth` first

**"Invalid refresh token"**
- Re-run `qwen auth`

### Health Check

```bash
curl http://localhost:31337/health
```
