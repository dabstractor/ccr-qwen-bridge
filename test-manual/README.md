# Manual Tests

This directory contains manual test scripts for debugging and testing specific components of the CCR Qwen Bridge.

## test-refresh-token.js

A simple script to test the Qwen token refresh functionality independently of the main server. This script:

1. Initializes the QwenAuthManager with the correct credentials
2. Attempts to refresh the access token
3. Outputs the result of the refresh operation

### Usage

```bash
cd test-manual
node test-refresh-token.js
```

This script is useful for:
- Debugging token refresh issues
- Verifying that credentials are working correctly
- Testing OAuth implementation without starting the full server