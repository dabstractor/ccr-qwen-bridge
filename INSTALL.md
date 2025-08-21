# Installation Guide

## Prerequisites

1. Node.js 18+ installed
2. npm (comes with Node.js)
3. Docker and Docker Compose (optional, for containerized deployment)

## Authentication Setup

### Qwen Provider (Required)

1. Install the Qwen CLI:
   ```bash
   npm install -g @qwen-code/qwen-code@latest
   ```

2. Authenticate with Qwen:
   ```bash
   qwen auth
   ```

### Gemini Provider (Optional)

1. Install the Gemini CLI:
   ```bash
   npm install -g @google/gemini-cli
   ```

2. Authenticate with Google:
   ```bash
   gemini auth
   ```

## Quick Setup

1. Clone the repository:
   ```bash
   git clone https://github.com/dabstractor/ccr-qwen-bridge
   cd ccr-qwen-bridge
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Set up provider credentials:
   ```bash
   npm run setup
   ```

4. Start the service:
   ```bash
   npm start
   ```

## Docker Deployment (Recommended)

1. Build and start the service:
   ```bash
   docker-compose up -d
   ```

2. View logs:
   ```bash
   docker-compose logs -f
   ```

## Configuration

Create a `.env` file in the project root to override defaults. Here are the available configuration options:

### Server Configuration
```
HOST=localhost              # Host to bind the server to
PORT=31337                  # Port to listen on
LOG_LEVEL=info             # Log level (debug, info, warn, error)
LOG_FORMAT=console         # Log format (console, json)
REQUEST_TIMEOUT=30000      # Request timeout in milliseconds
```

### Provider Configuration

#### Qwen Provider (enabled by default)
```
PROVIDER_QWEN_ENABLED=true                    # Enable/disable Qwen provider
PROVIDER_QWEN_CREDENTIALS_PATH=~/.qwen/oauth_creds.json  # Path to Qwen credentials
PROVIDER_QWEN_DEFAULT_MODEL=qwen3-coder-plus  # Default model to use
PROVIDER_QWEN_CLIENT_ID=f0304373b74a44d2b584a3fb70ca9e56  # Qwen OAuth client ID
PROVIDER_QWEN_TOKEN_URL=https://chat.qwen.ai/api/v1/oauth2/token  # OAuth token endpoint
# PROVIDER_QWEN_API_BASE_URL is auto-detected from OAuth response, leave empty for auto-detection
PROVIDER_QWEN_REQUEST_TIMEOUT=30000          # Request timeout for Qwen
```

#### Gemini Provider (disabled by default)
```
PROVIDER_GEMINI_ENABLED=false                 # Enable/disable Gemini provider
PROVIDER_GEMINI_CREDENTIALS_PATH=~/.gemini/oauth_creds.json  # Path to Gemini credentials
PROVIDER_GEMINI_DEFAULT_MODEL=gemini-pro      # Default model to use
PROVIDER_GEMINI_CLIENT_ID=your-client-id      # Gemini OAuth client ID
PROVIDER_GEMINI_CLIENT_SECRET=your-client-secret  # Gemini OAuth client secret
PROVIDER_GEMINI_API_BASE_URL=https://generativelanguage.googleapis.com/v1beta  # Gemini API base URL
PROVIDER_GEMINI_TOKEN_URL=https://oauth2.googleapis.com/token  # OAuth token endpoint
PROVIDER_GEMINI_REQUEST_TIMEOUT=60000         # Request timeout for Gemini
PROVIDER_GEMINI_CHUNKING_ENABLED=true         # Enable chunking for large requests
PROVIDER_GEMINI_CHUNKING_MAX_SIZE_BYTES=15728640  # Max chunk size (15MB)
PROVIDER_GEMINI_CHUNKING_MAX_LINES=1500       # Max lines per chunk
PROVIDER_GEMINI_CHUNKING_MAX_TOKENS=30000     # Max tokens per chunk
PROVIDER_GEMINI_CHUNKING_BATCH_SIZE=1         # Number of chunks to process at once
PROVIDER_GEMINI_CHUNKING_OVERLAP_LINES=50     # Overlap between chunks
PROVIDER_GEMINI_CHUNKING_STRATEGY=line-based  # Chunking strategy
```

### Development/Production
```
NODE_ENV=development        # Environment (development, production)
```

## Environment Variables Reference

| Variable | Default | Description |
|----------|---------|-------------|
| HOST | localhost | Server host |
| PORT | 31337 | Server port |
| LOG_LEVEL | info | Logging level |
| LOG_FORMAT | console | Log format (console/json) |
| REQUEST_TIMEOUT | 30000 | Global request timeout (ms) |
| PROVIDER_QWEN_ENABLED | true | Enable Qwen provider |
| PROVIDER_QWEN_CREDENTIALS_PATH | ~/.qwen/oauth_creds.json | Qwen credentials path |
| PROVIDER_QWEN_DEFAULT_MODEL | qwen3-coder-plus | Default Qwen model |
| PROVIDER_QWEN_CLIENT_ID | f0304373b74a44d2b584a3fb70ca9e56 | Qwen OAuth client ID |
| PROVIDER_QWEN_TOKEN_URL | https://chat.qwen.ai/api/v1/oauth2/token | Qwen OAuth token endpoint |
| PROVIDER_QWEN_REQUEST_TIMEOUT | 30000 | Qwen request timeout (ms) |
| PROVIDER_GEMINI_ENABLED | false | Enable Gemini provider |
| PROVIDER_GEMINI_CREDENTIALS_PATH | ~/.gemini/oauth_creds.json | Gemini credentials path |
| PROVIDER_GEMINI_DEFAULT_MODEL | gemini-pro | Default Gemini model |
| PROVIDER_GEMINI_CLIENT_ID | (required if enabled) | Gemini OAuth client ID |
| PROVIDER_GEMINI_CLIENT_SECRET | (required if enabled) | Gemini OAuth client secret |
| PROVIDER_GEMINI_API_BASE_URL | https://generativelanguage.googleapis.com/v1beta | Gemini API base URL |
| PROVIDER_GEMINI_TOKEN_URL | https://oauth2.googleapis.com/token | Gemini OAuth token endpoint |
| PROVIDER_GEMINI_REQUEST_TIMEOUT | 60000 | Gemini request timeout (ms) |
| PROVIDER_GEMINI_CHUNKING_ENABLED | true | Enable chunking for large requests |
| PROVIDER_GEMINI_CHUNKING_MAX_SIZE_BYTES | 15728640 | Max chunk size (15MB) |
| PROVIDER_GEMINI_CHUNKING_MAX_LINES | 1500 | Max lines per chunk |
| PROVIDER_GEMINI_CHUNKING_MAX_TOKENS | 30000 | Max tokens per chunk |
| PROVIDER_GEMINI_CHUNKING_BATCH_SIZE | 1 | Number of chunks to process at once |
| PROVIDER_GEMINI_CHUNKING_OVERLAP_LINES | 50 | Overlap between chunks |
| PROVIDER_GEMINI_CHUNKING_STRATEGY | line-based | Chunking strategy |
| NODE_ENV | development | Application environment |

## Health Check

Verify the service is running:
```bash
curl http://localhost:31337/health
```

## Updating

Pull the latest changes and restart:
```bash
git pull
npm install
npm start
```

Or with Docker:
```bash
git pull
docker-compose up -d --build
```

## Troubleshooting

### Common Issues

1. **Authentication failures**: Re-run the authentication process with official CLI tools
2. **Docker credential issues**: Ensure proper volume mounting in docker-compose.yml
3. **Timeout errors**: Increase REQUEST_TIMEOUT in configuration
4. **Provider not working**: Check provider-specific logs and configuration

### Viewing Logs

Docker logs:
```bash
docker-compose logs -f
```

Direct logs:
```bash
tail -f server.log
```