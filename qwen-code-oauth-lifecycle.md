### **Report on the Qwen-Code OAuth Lifecycle**

**1. Core Authentication Components**

*   **Authorization URL:** `https://chat.qwen.ai/api/v1/oauth2/device/code` (This is a device authorization endpoint, not a typical user-facing authorization URL).
    *   *Source:* `packages/core/src/qwen/qwenOAuth2.ts:20`
*   **Token URL:** `https://chat.qwen.ai/api/v1/oauth2/token`
    *   *Source:* `packages/core/src/qwen/qwenOAuth2.ts:21`
*   **Client ID:** `f0304373b74a44d2b584a3fb70ca9e56`
    *   *Source:* `packages/core/src/qwen/qwenOAuth2.ts:24`
*   **Requested Scopes:** `openid profile email model.completion`
    *   *Source:* `packages/core/src/qwen/qwenOAuth2.ts:26`
*   **Redirect URI:** Not applicable for the device authorization flow.

**2. Step-by-Step Authentication Flow**

1.  **Initiation:** The flow is triggered by the `getQwenOAuthClient` function when the user selects the `QWEN_OAUTH` authentication method. This can be initiated by running `qwen` for the first time or using the `/auth` command.
    *   *Source:* `packages/core/src/qwen/qwenOAuth2.ts:465`, `packages/cli/src/gemini.tsx:245`
2.  **Authorization:** The application makes a POST request to the device authorization endpoint. The response contains a `verification_uri_complete`, which is displayed to the user and automatically opened in their default web browser.
    *   *Source:* `packages/core/src/qwen/qwenOAuth2.ts:548-597`
3.  **Callback Handling:** No local web server is used. The CLI polls the token endpoint to check if the user has completed the authorization in their browser.
    *   *Source:* `packages/core/src/qwen/qwenOAuth2.ts:607-720`
4.  **Token Exchange:** The CLI makes HTTP POST requests to the Token URL with a `grant_type` of `urn:ietf:params:oauth:grant-type:device_code` and includes the `device_code` from the authorization step.
    ```json
    {
      "grant_type": "urn:ietf:params:oauth:grant-type:device_code",
      "client_id": "f0304373b74a44d2b584a3fb70ca9e56",
      "device_code": "...",
      "code_verifier": "..."
    }
    ```
    *   *Source:* `packages/core/src/qwen/qwenOAuth2.ts:307-370`
5.  **Token Storage:** The received `access_token` and `refresh_token` are stored in `~/.qwen/oauth_creds.json`.
    ```json
    {
      "access_token": "...",
      "refresh_token": "...",
      "token_type": "...",
      "resource_url": "...",
      "expiry_date": "..."
    }
    ```
    *   *Source:* `packages/core/src/qwen/qwenOAuth2.ts:30-31`, `823-831`

**3. Token Refresh Mechanism**

*   The `refreshAccessToken` function in `QwenOAuth2Client` is responsible for token refreshing.
*   It is triggered when an API call fails with an authentication error or when the `access_token` is nearing its expiration.
*   A POST request is made to the Token URL with the `grant_type` set to `refresh_token`.
    *   *Source:* `packages/core/src/qwen/qwenOAuth2.ts:372-433`, `packages/core/src/qwen/qwenContentGenerator.ts:179-186`

**4. Authenticated API Usage**

*   The primary API base URL is dynamically determined from the `resource_url` in the token response, with a fallback to `https://dashscope.aliyuncs.com/compatible-mode/v1`.
    *   *Source:* `packages/core/src/qwen/qwenContentGenerator.ts:23-25`, `298-300`
*   The access token is passed in the `Authorization` header as a Bearer token. This is handled by setting the `apiKey` of the underlying OpenAI-compatible client to the access token.
    *   *Source:* `packages/core/src/qwen/qwenContentGenerator.ts:83-99`

**5. Summary of Key Files**

*   `packages/core/src/qwen/qwenOAuth2.ts`: Handles the main device authorization and token management logic.
*   `packages/core/src/qwen/qwenContentGenerator.ts`: Defines the API client that uses the OAuth tokens to make authenticated requests.
*   `~/.qwen/oauth_creds.json`: Stores user credentials.
