# Claude Bridge for Claude Code Router

Get free daily API usage from Qwen and Gemini with your Claude Code Router.

## What is this?

Claude Bridge lets you use your free Qwen and Gemini API quotas with Claude Code Router. Point your router to this bridge and get access to free AI models instead of paying for Claude API usage.

## What You Get

- **Free Qwen Access**: Use qwen3-coder-plus and qwen3-coder-flash models at no cost
- **Free Gemini Access**: Use gemini-pro model with your Google account
- **Single Endpoint**: Configure once and use both providers seamlessly

## Prerequisites

1. Node.js 18+ installed
2. npm (comes with Node.js)
3. Docker and Docker Compose (optional, for containerized deployment)

## Authentication Setup

**NOTE**: You must complete authentication with each provider before running the setup script. The setup process extracts client credentials from the CLI tools and stores them in your `.env` file.

### Qwen Provider (Required)

1. Install the Qwen CLI:
   ```bash
   npm install -g @qwen-code/qwen-code@latest
   ```

2. Authenticate with Qwen (complete OAuth flow in browser):
   ```bash
   qwen auth
   ```

### Gemini Provider (Optional)

1. Install the Gemini CLI:
   ```bash
   npm install -g @google/gemini-cli
   ```

2. Authenticate with Google (complete OAuth flow in browser):
   ```bash
   gemini auth
   ```

## Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/dabstractor/ccr-qwen-bridge
   cd ccr-qwen-bridge
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. **IMPORTANT**: Authenticate with providers first (see Authentication Setup above), then set up provider credentials:
   ```bash
   npm run setup
   ```

4. Start the service:
   ```bash
   npm start
   ```

   Or use Docker (recommended):
   ```bash
   docker-compose up -d
   ```

## Configuration

Copy the example configuration file and customize as needed:

```bash
cp .env.example .env
```

Edit the `.env` file to configure server settings, provider options, and logging preferences.

## Health Check

Verify the service is running:
```bash
curl http://localhost:31337/health
```