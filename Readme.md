# Proxy Plus (Koa-based)

This project is a proxy server built using [Koa](https://koajs.com/). It is designed to forward, filter, and log HTTP and WebSocket requests between clients and backend services, providing a flexible middleware architecture for custom logic and integrations.

WebSocket support is included, which is especially useful when proxying the Neo4j server or other services that require real-time, bidirectional communication.

---

## Features

- HTTP and WebSocket proxying with Koa
- Middleware support for logging, user context, and policy enforcement
- Easily extendable for custom connectors and routes
- Dynamic routing and static file serving
- Conditional redirects based on request headers

---

## Usage

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Start the proxy server:**
   ```bash
   npm start
   ```

3. **Configure your client or application to send requests through this proxy.**

---

## Project Structure

- `src/app.ts` - Main application entry point
- `src/middleware/` - Koa middleware (context, logger, policy, user)
- `src/routes/` - Route handlers
- `src/utils/` - Utility functions
- `src/connectors/` - Example connectors
- `src/config/defaultEnv.ts` - Default dynamic route configuration

---

## Environment Variables

- **`DYNAMIC_ROUTES`**:  
  JSON string defining dynamic proxy routes. Example:
  ```json
  [
    {
      "name": "analytics",
      "route": "/analytics(.*)",
      "target": "http://<some webapp address>:3000",
      "requestHeaderRules": [
        { "operation": "create", "headerName": "x-proxy-plus", "value": "true" },
        { "operation": "update", "headerName": "x-forwarded-proto", "value": "https" },
        {
          "operation": "update",
          "headerName": "x-client-type",
          "value": "json",
          "when": { "condition": "header", "headerName": "accept", "includes": "application/json" }
        },
        { "operation": "patch", "headerName": "cookie", "pattern": "session=[^;]+", "replacement": "session=REDACTED" }
      ]
    }
  ]
  ```
  The first item on the list is the default application.
  
  `requestHeaderRules` are applied in order before proxying the request upstream and support CRUD-like `create`, `update`, `patch` (regex replace), and `delete`, optionally gated by a `when` header condition.

- **`IGNORE_URLS_FOR_LOGGING_BY_PREFIX`**:  
  Comma-separated list or JSON array of URL path prefixes to ignore in request logging. Useful for suppressing logs for health checks, static assets, or other non-essential endpoints.  
  Default: `['/_app', '/health', '/metrics', '/favicon.ico', '/robots.txt', '/static', '/public']`

- **`WS_TARGET_URL`**:  
  Specifies the default WebSocket backend URL to which the proxy will forward WebSocket connections.  
  If not set, it defaults to `ws://10.82.1.228:7687/`.  
  Set it in your environment to point to your desired WebSocket server.

- **`LOG_LEVEL=debug`**:  
  Turn on debug statements in your app.

---

## Example: Default Dynamic Routes Configuration (`defaultEnv.ts`)

Below is an example of the default dynamic routes configuration as found in `src/config/defaultEnv.ts`:

```typescript
export const DEFAULT_DYNAMIC_ROUTES = JSON.stringify([
  {
    name: "root",
    route: "/",
    policyName: "mock-always-allow",
    connectorName: "simple",
    redirect: {
      default: "/services",
      conditionalRedirects: [
        {
          condition: "header",
          headerName: "accept",
          includes: "application/json",
          redirect: "/graph/manifest.json"
        }
      ]
    }
  },
  {
    name: "static-files-browser-config-json",
    route: "/graph/:neo4j.browser.config.json",
    policyName: "mock-always-allow",
    connectorName: "simple",
    relativeFilePath: "src/config/neo4j.browser.config.json"
  },
  {
    name: "patched-favicon-ico",
    route: "/favicon.ico",
    policyName: "mock-always-allow",
    connectorName: "simple",
    redirect: "/analytics/favicon.ico"
  },
  {
    name: "patched-root-example",
    route: "/search",
    policyName: "mock-always-allow",
    connectorName: "simple",
    redirect: "/analytics/search"
  },
  {
    name: "Services",
    route: "/services",
    policyName: "mock-always-allow",
    connectorName: "simple",
    splashPage: true
  },
  {
    name: "Search",
    route: "/search(.*)",
    policyName: "mock-always-allow",
    connectorName: "simple"
  },
  {
    name: "Browser",
    route: "/analytics/(.*)",
    target: "http://10.182.1.86:3001",
    rewritebase: true,
    policyName: "mock-always-allow",
    connectorName: "simple"
  },
  {
    name: "Link Analytics",
    route: "/graph(.*)",
    target: "http://10.182.1.86:7474",
    rewritebase: false,
    policyName: "mock-always-allow",
    connectorName: "mock"
  }
]);
```

---

## TODO

- WebSocket forwarding is implemented for only one WebSocket. Add support for multiple WebSockets.

---

## Security Scanning (Trivy)

This repo includes a GitHub Actions workflow that runs Trivy on every PR and on pushes to `main`, and uploads results to GitHub Code Scanning:

- Workflow: `.github/workflows/trivy.yml`
- Output: `trivy.sarif` uploaded to the repo Security tab

---

## License

MIT

---

In order to work with neo4j authentication for read-only databases use following URL structure:

```http://localhost:3000/browser/?connectURL=bolt%3A%2F%2Flocalhost%3A3000&preselectAuthMethod=NO_AUTH&cmd=:play&arg=movies```
