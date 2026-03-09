# Authentication System

sd.cpp Studio supports optional API key authentication to secure access to the API and web interface.

## Overview

Authentication is **optional** and disabled by default. When enabled, all API endpoints (except `/api/config` and `/api/health`) require a valid API key to be provided.

## Configuration

### Enabling Authentication

Set the `API_KEY` environment variable:

```bash
# .env file
API_KEY=your-secret-api-key-here

# Or export directly
export API_KEY=your-secret-api-key-here
```

When `API_KEY` is set, authentication is automatically enabled for all protected endpoints.

### Disabling Authentication

Simply unset or leave empty the `API_KEY` environment variable:

```bash
# .env file
API_KEY=

# Or unset
unset API_KEY
```

## API Key Format

API keys can be any string value. We recommend using:
- At least 32 characters
- Mix of letters, numbers, and symbols
- No spaces or special URL characters

Example: `sk-sd-cpp-studio-2024-abc123xyz789`

## Using API Keys

### Header Authentication (Recommended)

Include the API key in the `Authorization` header using Bearer token format:

```bash
curl http://localhost:3000/api/v1/images/generations \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"prompt": "a cat"}'
```

### X-Api-Key Header (Alternative)

For clients that don't support Bearer tokens:

```bash
curl http://localhost:3000/api/v1/images/generations \
  -H "X-Api-Key: YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"prompt": "a cat"}'
```

### Basic Authentication (SillyTavern Compatibility)

For SillyTavern compatibility, Basic auth is also supported:

```bash
curl http://localhost:3000/api/v1/images/generations \
  -H "Authorization: Basic $(echo -n 'YOUR_API_KEY' | base64)" \
  -H "Content-Type: application/json" \
  -d '{"prompt": "a cat"}'
```

## Public Endpoints (No Authentication Required)

These endpoints are always accessible without an API key:

| Endpoint | Purpose |
|----------|---------|
| `GET /api/health` | Health check for monitoring |
| `GET /api/config` | Get server configuration and auth status |

## Checking Authentication Status

Use the `/api/config` endpoint to check authentication status:

```bash
curl http://localhost:3000/api/config
```

Response:
```json
{
  "sdApiEndpoint": "http://192.168.2.180:1234/v1",
  "model": "qwen-image",
  "authEnabled": true,
  "keyPassed": false,
  "keyValid": false
}
```

### Response Fields

- **sdApiEndpoint**: The configured SD API endpoint URL
- **model**: The default model ID
- **authEnabled** (`boolean`): Whether authentication is enabled on the server
- **keyPassed** (`boolean`): Whether an API key was provided in the request
- **keyValid** (`boolean`): Whether the provided API key is correct (only `true` when both `authEnabled` and `keyPassed` are `true` and the key matches)

### Checking Key Validity

To validate an API key, provide it in the request:

```bash
curl http://localhost:3000/api/config \
  -H "Authorization: Bearer YOUR_API_KEY"
```

Response when key is valid:
```json
{
  "sdApiEndpoint": "http://192.168.2.180:1234/v1",
  "model": "qwen-image",
  "authEnabled": true,
  "keyPassed": true,
  "keyValid": true
}
```

## Frontend Authentication Flow

The web interface handles authentication automatically:

1. **Initial Load**: The frontend calls `/api/config` with any stored API key
2. **Check Flags**:
   - If `authEnabled: false` → Proceed without authentication
   - If `authEnabled: true` and `keyValid: true` → Proceed with authentication
   - If `authEnabled: true` and `keyValid: false` → Show API key modal
3. **Key Entry**: User enters API key in the modal
4. **Validation**: Frontend validates key by calling `/api/config` with the new key
5. **Storage**: Valid key is saved to `localStorage` for future sessions

### Storing API Keys in Frontend

The frontend stores the API key in browser `localStorage`:

```javascript
// Key is stored under this name
localStorage.setItem('sd-cpp-studio-api-key', 'your-api-key');
```

To clear the stored key:

```javascript
localStorage.removeItem('sd-cpp-studio-api-key');
```

## Error Responses

When authentication is required but missing or invalid:

### Missing API Key (401)

```json
{
  "error": "Unauthorized",
  "message": "Missing API key. Use Authorization: Bearer <API_KEY> or X-Api-Key: <API_KEY> header"
}
```

### Invalid API Key (403)

```json
{
  "error": "Forbidden",
  "message": "Invalid API key"
}
```

## Security Considerations

### API Key Storage

- **Server-side**: Store `API_KEY` in environment variables or `.env` file (never commit to git)
- **Client-side**: API keys are stored in browser `localStorage` - use HTTPS in production
- **Transmission**: Always use HTTPS when API keys are involved

### Reverse Proxy Setup

When using a reverse proxy (nginx, Apache, etc.):

```nginx
# Forward Authorization header
location / {
    proxy_pass http://localhost:3000;
    proxy_set_header Authorization $http_authorization;
    proxy_set_header X-Api-Key $http_x_api_key;
}
```

### Rate Limiting

Consider implementing rate limiting at the reverse proxy level:

```nginx
limit_req_zone $binary_remote_addr zone=api:10m rate=10r/s;

location / {
    limit_req zone=api burst=20 nodelay;
    proxy_pass http://localhost:3000;
}
```

## Integration Examples

### Python

```python
import requests

API_KEY = "your-api-key"
BASE_URL = "http://localhost:3000"

# Make authenticated request
response = requests.post(
    f"{BASE_URL}/api/v1/images/generations",
    headers={"Authorization": f"Bearer {API_KEY}"},
    json={"prompt": "a cat"}
)

# Check auth status first
config = requests.get(f"{BASE_URL}/api/config").json()
if config["authEnabled"] and not config["keyValid"]:
    print("Authentication required!")
```

### JavaScript/TypeScript

```typescript
const API_KEY = "your-api-key";
const BASE_URL = "http://localhost:3000";

// Check auth status
const checkAuth = async () => {
  const response = await fetch(`${BASE_URL}/api/config`, {
    headers: { "Authorization": `Bearer ${API_KEY}` }
  });
  const config = await response.json();
  
  if (config.authEnabled && config.keyValid) {
    console.log("Authenticated successfully");
  }
};

// Make authenticated request
const generateImage = async (prompt: string) => {
  const response = await fetch(`${BASE_URL}/api/v1/images/generations`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ prompt })
  });
  return response.json();
};
```

### SillyTavern

Configure SillyTavern to use your API key:

1. Go to **Extensions** → **Stable Diffusion**
2. Set **Source** to `SD.next / Automatic1111`
3. Set **URL** to `http://your-server:3000`
4. Set **Auth** to your API key
5. Click **Connect**

SillyTavern will automatically use Basic auth with your API key.

## Troubleshooting

### "Invalid API key" errors

1. Check that `API_KEY` is set correctly in your `.env` file
2. Restart the server after changing `.env`
3. Verify the key in the request matches exactly (case-sensitive)
4. Check that the `Authorization` header format is correct: `Bearer YOUR_KEY`

### Frontend keeps asking for API key

1. Check server logs to ensure `API_KEY` is loaded
2. Clear browser `localStorage` and refresh
3. Check browser DevTools Network tab for `/api/config` response

### curl requests failing with 401

Make sure to quote the header value:

```bash
# Wrong - shell may interpret special characters
curl -H Authorization: Bearer my-key

# Correct
curl -H "Authorization: Bearer my-key"
```

## See Also

- [REST API Documentation](./rest-api.md) - Full API reference
- [Environment Variables](./environment-variables.md) - All configuration options
