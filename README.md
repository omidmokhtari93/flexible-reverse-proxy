# Flexible Reverse Proxy

A simple reverse proxy server with configurable routing and CORS support.

## Installation

### Global Installation (Recommended)

```bash
npm install -g flexible-reverse-proxy
```

### Local Installation

```bash
npm install flexible-reverse-proxy
```

## Usage

### Command Line Interface

After global installation, you can use the `flexible-proxy` command:

```bash
# Basic usage with routes
flexible-proxy --route "/api:http://localhost:3000" --route "/auth:https://auth.example.com"

# Custom port
flexible-proxy --port 3000 --route "/api:http://localhost:3000"

# Custom host and port
flexible-proxy --host 0.0.0.0 --port 8080 --route "/api:http://localhost:3000"

# Load routes from file
flexible-proxy --routes-file routes.json

# Enable verbose logging
flexible-proxy --route "/api:http://localhost:3000" --verbose

# Different log levels
flexible-proxy --route "/api:http://localhost:3000" --log-level detailed
flexible-proxy --route "/api:http://localhost:3000" --log-level full

# Control header forwarding
flexible-proxy --route "/api:http://localhost:3000" --no-change-origin
flexible-proxy --route "/api:http://localhost:3000" --no-preserve-headers

# Show help
flexible-proxy --help
```

### Command Line Options

- `-p, --port <port>` - Port to listen on (default: 8000)
- `-h, --host <host>` - Host to bind to (default: localhost)
- `-r, --route <pattern:target>` - Add a route (pattern:target). Can be used multiple times
- `--routes-file <file>` - Load routes from a JSON file
- `--verbose` - Enable verbose logging
- `--log-level <level>` - Log level: basic, detailed, full (default: basic)
- `--preserve-headers` - Preserve all original headers (default: true)
- `--no-preserve-headers` - Do not preserve original headers
- `--change-origin` - Change the origin header to target host (default: true)
- `--no-change-origin` - Do not change the origin header
- `--version` - Show version
- `--help` - Show help

### Pretty Logging

The proxy now features beautiful, colored logging with emojis and structured output:

#### Server Startup

```
🚀 Flexible Reverse Proxy Server
══════════════════════════════════════════════════
📍 Server running at http://localhost:8000
📊 Log level: detailed
🛣️ Routes configured:
   /api → http://localhost:3000
   /auth → https://auth.example.com
══════════════════════════════════════════════════
```

#### Request Logs

```
[2024-01-15T10:30:45.123Z] [abc123def456]
GET     /api/users → http://localhost:3000
📋 Headers:
   Authorization: Bearer token123
   Content-Type: application/json
📦 Body: {"name": "John"}
```

#### Response Logs

```
[2024-01-15T10:30:45.125Z] [abc123def456]
200 OK
📋 Response Headers:
   Content-Type: application/json
📦 Response Body: {"users": [...]}
```

#### Error Logs

```
[2024-01-15T10:30:45.125Z] [abc123def456]
❌ Proxy error: connect ECONNREFUSED
```

### Header Forwarding

The proxy server forwards all headers to the target server by default. Here's how header handling works:

#### Default Behavior

- **All headers are forwarded** to the target server
- **Host header is modified** to match the target server (when `changeOrigin` is enabled)
- **X-Forwarded-\* headers are added** for proper proxy identification
- **Connection and Content-Length headers are managed** automatically

#### Header Control Options

```bash
# Preserve all headers (default)
flexible-proxy --route "/api:http://localhost:3000" --preserve-headers

# Don't preserve headers
flexible-proxy --route "/api:http://localhost:3000" --no-preserve-headers

# Don't change the origin header
flexible-proxy --route "/api:http://localhost:3000" --no-change-origin

# Don't change the origin header and preserve all headers
flexible-proxy --route "/api:http://localhost:3000" --no-change-origin --preserve-headers
```

### Logging Levels

The proxy supports three logging levels with beautiful formatting:

#### Basic (default)

- Request method, URL, and target with colors
- Error messages with emojis
- Server startup information with ASCII art

#### Detailed

- Everything from basic level
- Request headers with structured display
- Response status codes with color coding

#### Full

- Everything from detailed level
- Request body (for POST/PUT/PATCH) with syntax highlighting
- Response headers and body with full details

### Route Configuration

Routes can be specified in two ways:

#### 1. Command Line Arguments

```bash
flexible-proxy --route "/api:http://localhost:3000" --route "/auth:https://auth.example.com"
```

#### 2. JSON File

Create a `routes.json` file:

```json
{
  "/api": "http://localhost:3000",
  "/auth": "https://auth.example.com",
  "/static": "http://localhost:8080"
}
```

Then use it:

```bash
flexible-proxy --routes-file routes.json
```

### Programmatic Usage

You can also use the package programmatically:

```javascript
const { createProxyServer } = require("flexible-reverse-proxy");

const routes = {
  "/api": "http://localhost:3000",
  "/auth": "https://auth.example.com",
};

const server = createProxyServer({
  port: 8000,
  host: "localhost",
  routes: routes,
  verbose: true,
  logLevel: "detailed",
  preserveHeaders: true,
  changeOrigin: true,
});

server.start();
```

## Examples

### Simple API Proxy

```bash
flexible-proxy --route "/api:http://localhost:3000"
```

### Multiple Services with Detailed Logging

```bash
flexible-proxy \
  --route "/api:http://localhost:3000" \
  --route "/auth:https://auth.example.com" \
  --log-level detailed
```

### Full Logging for Debugging

```bash
flexible-proxy \
  --route "/api:http://localhost:3000" \
  --log-level full
```

### Custom Header Handling

```bash
# Forward all headers without changing origin
flexible-proxy \
  --route "/api:http://localhost:3000" \
  --no-change-origin \
  --preserve-headers

# Minimal header forwarding
flexible-proxy \
  --route "/api:http://localhost:3000" \
  --no-preserve-headers
```

### Load from File

```bash
# routes.json
{
  "/api": "http://localhost:3000",
  "/auth": "https://auth.example.com"
}

# Command
flexible-proxy --routes-file routes.json --log-level detailed
```

## Features

- **Flexible Routing**: Configure any URL pattern to any target server
- **Pretty Logging**: Beautiful colored logs with emojis and structured output
- **Comprehensive Logging**: Three log levels with detailed request/response information
- **Complete Header Forwarding**: All headers are forwarded to target servers
- **CORS Support**: Automatically handles CORS headers for cross-origin requests
- **Multiple Configuration Methods**: Command line or JSON file
- **Error Handling**: Proper error handling for proxy failures
- **Preflight Support**: Handles OPTIONS requests for CORS preflight
- **Request Tracking**: Unique request IDs for tracking requests through logs
- **Header Control**: Options to control header forwarding behavior

## Development

### Local Development

```bash
# Clone the repository
git clone <repository-url>
cd reverse.proxy

# Install dependencies
npm install

# Run the server with example routes
npm start

# Or run the CLI locally
node bin/cli.js --route "/api:http://localhost:3000" --log-level detailed
```

### Building for Distribution

```bash
npm publish
```

## License

MIT
